const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { createDbPool, testConnection } = require('../common/database/db-config');
const { parseUhcEobPdf } = require('./lib/uhcEobParser');
const {
  findDuplicateEobGroups,
  enrichParseResultsWithDuplicates,
  assertNotDuplicate,
  DuplicateEobError,
  getEobDedupeKey,
  findExistingEob,
} = require('./lib/eobDuplicate');
const { parseOptionalMoney, parseOptionalNotes, InvalidLineFieldError } = require('./lib/claimLineFields');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const app = express();
const port = process.env.PORT || 80;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

let isReady = false;

app.use(cors());
app.use(express.json());

const pool = createDbPool({
  database: process.env.DB_NAME || 'eobtracker',
});

testConnection(pool);

const CLAIM_WITH_TOTALS_SQL = `
  SELECT
    c.*,
    e.statement_date,
    e.member_name,
    e.eob_reference,
    COALESCE(SUM(cl.amount_owed), 0)::numeric AS total_owed,
    CASE
      WHEN COALESCE(SUM(cl.amount_owed), 0) = 0 THEN 'no_balance'
      WHEN c.paid_date IS NOT NULL THEN 'paid'
      WHEN c.billed_date IS NOT NULL THEN 'unpaid'
      ELSE 'unbilled'
    END AS status
  FROM claim c
  JOIN eob_statement e ON e.id = c.eob_statement_id
  LEFT JOIN claim_line cl ON cl.claim_id = c.id
`;

function groupClaimsByStatus(rows) {
  const grouped = {
    unbilled: [],
    unpaid: [],
    paid: [],
    no_balance: [],
  };
  for (const row of rows) {
    grouped[row.status]?.push(row);
  }
  return grouped;
}

async function fetchClaimById(id) {
  const result = await pool.query(
    `${CLAIM_WITH_TOTALS_SQL}
     WHERE c.id = $1
     GROUP BY c.id, e.id`,
    [id]
  );
  return result.rows[0] || null;
}

async function fetchClaimLines(claimId) {
  const result = await pool.query(
    'SELECT * FROM claim_line WHERE claim_id = $1 ORDER BY service_date_start, id',
    [claimId]
  );
  return result.rows;
}

async function insertEobWithClaims(client, payload) {
  await assertNotDuplicate(client, payload);

  const {
    statement_date,
    service_period_start,
    service_period_end,
    member_name,
    member_id,
    eob_reference,
    total_provider_billed,
    total_amount_owed,
    claims = [],
  } = payload;

  const eobResult = await client.query(
    `INSERT INTO eob_statement (
      statement_date, service_period_start, service_period_end,
      member_name, member_id, eob_reference,
      total_provider_billed, total_amount_owed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      statement_date || null,
      service_period_start || null,
      service_period_end || null,
      member_name || null,
      member_id || null,
      eob_reference || null,
      total_provider_billed ?? null,
      total_amount_owed ?? null,
    ]
  );

  const eob = eobResult.rows[0];

  for (const claim of claims) {
    const claimResult = await client.query(
      `INSERT INTO claim (
        eob_statement_id, provider_name, network_status,
        patient_account_number, claim_number, billed_date, paid_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        eob.id,
        claim.provider_name,
        claim.network_status || null,
        claim.patient_account_number || null,
        claim.claim_number || null,
        claim.billed_date || null,
        claim.paid_date || null,
        claim.notes || null,
      ]
    );

    const claimRow = claimResult.rows[0];
    for (const line of claim.lines || []) {
      await client.query(
        `INSERT INTO claim_line (
          claim_id, service_description, service_date_start, service_date_end,
          processing_code, processing_code_description,
          provider_billed, amount_saved, plan_allowed, plan_paid,
          applied_deductible, copay, coinsurance, plan_not_cover, amount_owed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          claimRow.id,
          line.service_description,
          line.service_date_start || null,
          line.service_date_end || null,
          line.processing_code || null,
          line.processing_code_description || null,
          line.provider_billed ?? 0,
          line.amount_saved ?? 0,
          line.plan_allowed ?? 0,
          line.plan_paid ?? 0,
          line.applied_deductible ?? 0,
          line.copay ?? 0,
          line.coinsurance ?? 0,
          line.plan_not_cover ?? 0,
          line.amount_owed ?? 0,
        ]
      );
    }
  }

  return eob;
}

app.get('/api/health', (req, res) => {
  const payload = {
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || '1.0.0',
  };
  res.status(isReady ? 200 : 503).json(payload);
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const result = await pool.query(
      `${CLAIM_WITH_TOTALS_SQL}
       GROUP BY c.id, e.id
       ORDER BY e.statement_date DESC NULLS LAST, c.id`
    );
    const claims = result.rows;
    const grouped = groupClaimsByStatus(claims);

    const sumOwed = (list) => list.reduce((sum, c) => sum + Number(c.total_owed || 0), 0);
    const duplicates = await findDuplicateEobGroups(pool);

    res.json({
      summary: {
        unbilled_count: grouped.unbilled.length,
        unbilled_total: sumOwed(grouped.unbilled),
        unpaid_count: grouped.unpaid.length,
        unpaid_total: sumOwed(grouped.unpaid),
        paid_count: grouped.paid.length,
        paid_total: sumOwed(grouped.paid),
        no_balance_count: grouped.no_balance.length,
        duplicate_eob_groups: duplicates.length,
      },
      claims: grouped,
      duplicates,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Database tables missing. Run database/schema.sql first.' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch dashboard' });
  }
});

app.get('/api/eobs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*,
        COUNT(DISTINCT c.id)::int AS claim_count,
        COALESCE(SUM(cl.amount_owed), 0)::numeric AS total_owed,
        MIN(c.billed_date) AS billed_date,
        MAX(c.billed_date) AS billed_date_end,
        MIN(c.paid_date) AS paid_date,
        MAX(c.paid_date) AS paid_date_end
       FROM eob_statement e
       LEFT JOIN claim c ON c.eob_statement_id = e.id
       LEFT JOIN claim_line cl ON cl.claim_id = c.id
       GROUP BY e.id
       ORDER BY e.statement_date DESC NULLS LAST, e.id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching EOBs:', error);
    res.status(500).json({ error: 'Failed to fetch EOB statements' });
  }
});

app.get('/api/eobs/:id', async (req, res) => {
  try {
    const eobResult = await pool.query('SELECT * FROM eob_statement WHERE id = $1', [req.params.id]);
    if (eobResult.rows.length === 0) {
      return res.status(404).json({ error: 'EOB statement not found' });
    }

    const claimsResult = await pool.query(
      `${CLAIM_WITH_TOTALS_SQL}
       WHERE c.eob_statement_id = $1
       GROUP BY c.id, e.id
       ORDER BY c.id`,
      [req.params.id]
    );

    const claims = [];
    for (const claim of claimsResult.rows) {
      const lines = await fetchClaimLines(claim.id);
      claims.push({ ...claim, lines });
    }

    res.json({ ...eobResult.rows[0], claims });
  } catch (error) {
    console.error('Error fetching EOB:', error);
    res.status(500).json({ error: 'Failed to fetch EOB statement' });
  }
});

app.post('/api/eobs', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eob = await insertEobWithClaims(client, req.body);
    await client.query('COMMIT');
    res.status(201).json(eob);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating EOB:', error);
    if (error instanceof DuplicateEobError) {
      return res.status(409).json({ error: error.message, duplicate: error.duplicate });
    }
    res.status(500).json({ error: error.message || 'Failed to create EOB statement' });
  } finally {
    client.release();
  }
});

app.post('/api/eobs/import', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payload = req.body.statement || req.body;
    const eob = await insertEobWithClaims(client, payload);
    await client.query('COMMIT');
    res.status(201).json(eob);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error importing EOB:', error);
    if (error instanceof DuplicateEobError) {
      return res.status(409).json({ error: error.message, duplicate: error.duplicate });
    }
    res.status(500).json({ error: error.message || 'Failed to import EOB statement' });
  } finally {
    client.release();
  }
});

app.post('/api/eobs/parse-pdf', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 50 },
]), async (req, res) => {
  try {
    const uploads = [
      ...(req.files?.file || []),
      ...(req.files?.files || []),
    ];

    if (uploads.length === 0) {
      return res.status(400).json({ error: 'At least one PDF file is required' });
    }

    const results = [];
    for (const uploadFile of uploads) {
      try {
        const parsed = await parseUhcEobPdf(uploadFile.buffer);
        results.push({
          filename: uploadFile.originalname,
          statement: parsed.statement,
          warnings: parsed.warnings || [],
        });
      } catch (error) {
        results.push({
          filename: uploadFile.originalname,
          error: error.message || 'Failed to parse PDF',
        });
      }
    }

    await enrichParseResultsWithDuplicates(pool, results);

    if (uploads.length === 1 && results[0] && !results[0].error) {
      return res.json({
        statement: results[0].statement,
        warnings: results[0].warnings,
        duplicate: results[0].duplicate || null,
        results,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error parsing PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to parse PDF' });
  }
});

app.post('/api/eobs/import-batch', async (req, res) => {
  const statements = req.body.statements;
  if (!Array.isArray(statements) || statements.length === 0) {
    return res.status(400).json({ error: 'statements array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eobs = [];
    const skipped = [];
    const seenInBatch = new Set();

    for (const statement of statements) {
      const dedupeKey = getEobDedupeKey(statement);
      if (dedupeKey) {
        if (seenInBatch.has(dedupeKey.key)) {
          skipped.push({
            reason: 'batch_duplicate',
            match_key: dedupeKey.key,
            statement,
          });
          continue;
        }
        seenInBatch.add(dedupeKey.key);
      }

      const existing = await findExistingEob(client, statement);
      if (existing) {
        skipped.push({
          reason: 'database_duplicate',
          match_key: dedupeKey?.key || null,
          existing_eob_id: existing.id,
          statement,
        });
        continue;
      }

      const eob = await insertEobWithClaims(client, statement);
      eobs.push(eob);
    }

    await client.query('COMMIT');
    res.status(201).json({ eobs, skipped });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error batch importing EOBs:', error);
    if (error instanceof DuplicateEobError) {
      return res.status(409).json({ error: error.message, duplicate: error.duplicate });
    }
    res.status(500).json({ error: error.message || 'Failed to import EOB statements' });
  } finally {
    client.release();
  }
});

app.put('/api/eobs/:id', async (req, res) => {
  try {
    const {
      statement_date,
      service_period_start,
      service_period_end,
      member_name,
      member_id,
      eob_reference,
      total_provider_billed,
      total_amount_owed,
    } = req.body;

    const result = await pool.query(
      `UPDATE eob_statement SET
        statement_date = $1,
        service_period_start = $2,
        service_period_end = $3,
        member_name = $4,
        member_id = $5,
        eob_reference = $6,
        total_provider_billed = $7,
        total_amount_owed = $8,
        modified = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        statement_date || null,
        service_period_start || null,
        service_period_end || null,
        member_name || null,
        member_id || null,
        eob_reference || null,
        total_provider_billed ?? null,
        total_amount_owed ?? null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'EOB statement not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating EOB:', error);
    res.status(500).json({ error: 'Failed to update EOB statement' });
  }
});

app.delete('/api/eobs/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM eob_statement WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'EOB statement not found' });
    }
    res.json({ message: 'EOB statement deleted' });
  } catch (error) {
    console.error('Error deleting EOB:', error);
    res.status(500).json({ error: 'Failed to delete EOB statement' });
  }
});

app.get('/api/claims/:id', async (req, res) => {
  try {
    const claim = await fetchClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    const lines = await fetchClaimLines(claim.id);
    const eobResult = await pool.query('SELECT * FROM eob_statement WHERE id = $1', [claim.eob_statement_id]);
    res.json({ ...claim, lines, eob: eobResult.rows[0] || null });
  } catch (error) {
    console.error('Error fetching claim:', error);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
});

app.patch('/api/claims/:id', async (req, res) => {
  try {
    const { billed_date, paid_date, notes } = req.body;
    const result = await pool.query(
      `UPDATE claim SET
        billed_date = $1,
        paid_date = $2,
        notes = $3,
        modified = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [
        billed_date === '' ? null : billed_date ?? null,
        paid_date === '' ? null : paid_date ?? null,
        notes ?? null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = await fetchClaimById(req.params.id);
    res.json(claim);
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

app.put('/api/claims/:id/lines/:lineId', async (req, res) => {
  try {
    const {
      service_description,
      service_date_start,
      service_date_end,
      processing_code,
      processing_code_description,
      provider_billed,
      amount_saved,
      plan_allowed,
      plan_paid,
      applied_deductible,
      copay,
      coinsurance,
      plan_not_cover,
      amount_owed,
    } = req.body;
    const actualBilled = parseOptionalMoney(req.body.actual_billed);
    const notes = parseOptionalNotes(req.body.notes);

    const result = await pool.query(
      `UPDATE claim_line SET
        service_description = COALESCE($1, service_description),
        service_date_start = COALESCE($2, service_date_start),
        service_date_end = COALESCE($3, service_date_end),
        processing_code = COALESCE($4, processing_code),
        processing_code_description = COALESCE($5, processing_code_description),
        provider_billed = COALESCE($6, provider_billed),
        amount_saved = COALESCE($7, amount_saved),
        plan_allowed = COALESCE($8, plan_allowed),
        plan_paid = COALESCE($9, plan_paid),
        applied_deductible = COALESCE($10, applied_deductible),
        copay = COALESCE($11, copay),
        coinsurance = COALESCE($12, coinsurance),
        plan_not_cover = COALESCE($13, plan_not_cover),
        amount_owed = COALESCE($14, amount_owed),
        actual_billed = CASE WHEN $15 THEN $16::numeric ELSE actual_billed END,
        notes = CASE WHEN $17 THEN $18 ELSE notes END,
        modified = CURRENT_TIMESTAMP
       WHERE id = $19 AND claim_id = $20
       RETURNING *`,
      [
        service_description || null,
        service_date_start || null,
        service_date_end || null,
        processing_code || null,
        processing_code_description || null,
        provider_billed ?? null,
        amount_saved ?? null,
        plan_allowed ?? null,
        plan_paid ?? null,
        applied_deductible ?? null,
        copay ?? null,
        coinsurance ?? null,
        plan_not_cover ?? null,
        amount_owed ?? null,
        actualBilled.present,
        actualBilled.value ?? null,
        notes.present,
        notes.value ?? null,
        req.params.lineId,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Claim line not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof InvalidLineFieldError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating claim line:', error);
    res.status(500).json({ error: 'Failed to update claim line' });
  }
});

app.post('/api/claims/:id/lines', async (req, res) => {
  try {
    const claim = await fetchClaimById(req.params.id);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const {
      service_description,
      service_date_start,
      service_date_end,
      processing_code,
      processing_code_description,
      provider_billed,
      amount_saved,
      plan_allowed,
      plan_paid,
      applied_deductible,
      copay,
      coinsurance,
      plan_not_cover,
      amount_owed,
    } = req.body;

    if (!service_description) {
      return res.status(400).json({ error: 'service_description is required' });
    }

    const result = await pool.query(
      `INSERT INTO claim_line (
        claim_id, service_description, service_date_start, service_date_end,
        processing_code, processing_code_description,
        provider_billed, amount_saved, plan_allowed, plan_paid,
        applied_deductible, copay, coinsurance, plan_not_cover, amount_owed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        req.params.id,
        service_description,
        service_date_start || null,
        service_date_end || null,
        processing_code || null,
        processing_code_description || null,
        provider_billed ?? 0,
        amount_saved ?? 0,
        plan_allowed ?? 0,
        plan_paid ?? 0,
        applied_deductible ?? 0,
        copay ?? 0,
        coinsurance ?? 0,
        plan_not_cover ?? 0,
        amount_owed ?? 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating claim line:', error);
    res.status(500).json({ error: 'Failed to create claim line' });
  }
});

function startServer(portToUse = port) {
  return app.listen(portToUse, () => {
    console.log(`Server running on port ${portToUse}`);
    isReady = true;
  });
}

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}
