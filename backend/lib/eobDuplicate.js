function normalizeRef(value) {
  const ref = (value || '').trim();
  return ref || null;
}

function getEobDedupeKey(statement) {
  if (!statement) return null;

  const eobReference = normalizeRef(statement.eob_reference);
  if (eobReference) {
    return { type: 'eob_reference', key: eobReference };
  }

  const memberId = (statement.member_id || '').trim();
  const statementDate = statement.statement_date || null;
  if (!memberId || !statementDate) {
    return null;
  }

  return {
    type: 'composite',
    key: [
      memberId,
      statementDate,
      statement.service_period_start || '',
      statement.service_period_end || '',
    ].join('|'),
  };
}

async function findExistingEob(client, statement) {
  const dedupeKey = getEobDedupeKey(statement);
  if (!dedupeKey) return null;

  if (dedupeKey.type === 'eob_reference') {
    const result = await client.query(
      'SELECT * FROM eob_statement WHERE eob_reference = $1 ORDER BY id LIMIT 1',
      [dedupeKey.key]
    );
    return result.rows[0] || null;
  }

  const result = await client.query(
    `SELECT * FROM eob_statement
     WHERE (eob_reference IS NULL OR TRIM(eob_reference) = '')
       AND member_id = $1
       AND statement_date = $2
       AND COALESCE(service_period_start::text, '') = $3
       AND COALESCE(service_period_end::text, '') = $4
     ORDER BY id
     LIMIT 1`,
    [
      (statement.member_id || '').trim(),
      statement.statement_date,
      statement.service_period_start || '',
      statement.service_period_end || '',
    ]
  );
  return result.rows[0] || null;
}

async function findDuplicateEobGroups(pool) {
  const byReference = await pool.query(
    `SELECT
       eob_reference AS match_key,
       'eob_reference' AS match_type,
       json_agg(
         json_build_object(
           'id', id,
           'statement_date', statement_date,
           'member_name', member_name,
           'member_id', member_id,
           'eob_reference', eob_reference,
           'service_period_start', service_period_start,
           'service_period_end', service_period_end,
           'total_amount_owed', total_amount_owed,
           'modified', modified
         )
         ORDER BY id
       ) AS eobs
     FROM eob_statement
     WHERE eob_reference IS NOT NULL AND TRIM(eob_reference) <> ''
     GROUP BY eob_reference
     HAVING COUNT(*) > 1`
  );

  const byComposite = await pool.query(
    `SELECT
       CONCAT(member_id, '|', statement_date, '|', COALESCE(service_period_start::text, ''), '|', COALESCE(service_period_end::text, '')) AS match_key,
       'composite' AS match_type,
       json_agg(
         json_build_object(
           'id', id,
           'statement_date', statement_date,
           'member_name', member_name,
           'member_id', member_id,
           'eob_reference', eob_reference,
           'service_period_start', service_period_start,
           'service_period_end', service_period_end,
           'total_amount_owed', total_amount_owed,
           'modified', modified
         )
         ORDER BY id
       ) AS eobs
     FROM eob_statement
     WHERE eob_reference IS NULL OR TRIM(eob_reference) = ''
     GROUP BY member_id, statement_date, service_period_start, service_period_end
     HAVING COUNT(*) > 1`
  );

  return [...byReference.rows, ...byComposite.rows];
}

async function enrichParseResultsWithDuplicates(pool, results) {
  const client = await pool.connect();
  const batchFirst = new Map();

  try {
    for (const result of results) {
      if (!result.statement) continue;

      const dedupeKey = getEobDedupeKey(result.statement);
      if (!dedupeKey) continue;

      const existing = await findExistingEob(client, result.statement);
      if (existing) {
        result.duplicate = {
          type: 'database',
          match_type: dedupeKey.type,
          match_key: dedupeKey.key,
          existing_eob_id: existing.id,
          existing_statement_date: existing.statement_date,
          existing_member_name: existing.member_name,
          existing_eob_reference: existing.eob_reference,
        };
        continue;
      }

      if (batchFirst.has(dedupeKey.key)) {
        result.duplicate = {
          type: 'batch',
          match_type: dedupeKey.type,
          match_key: dedupeKey.key,
          duplicate_of_filename: batchFirst.get(dedupeKey.key),
        };
        continue;
      }

      batchFirst.set(dedupeKey.key, result.filename);
    }
  } finally {
    client.release();
  }

  return results;
}

class DuplicateEobError extends Error {
  constructor(message, duplicate) {
    super(message);
    this.name = 'DuplicateEobError';
    this.code = 'DUPLICATE_EOB';
    this.duplicate = duplicate;
  }
}

async function assertNotDuplicate(client, statement) {
  const existing = await findExistingEob(client, statement);
  if (!existing) return;

  const dedupeKey = getEobDedupeKey(statement);
  throw new DuplicateEobError('EOB already exists', {
    match_type: dedupeKey?.type,
    match_key: dedupeKey?.key,
    existing_eob_id: existing.id,
    existing_statement_date: existing.statement_date,
    existing_member_name: existing.member_name,
    existing_eob_reference: existing.eob_reference,
  });
}

module.exports = {
  getEobDedupeKey,
  findExistingEob,
  findDuplicateEobGroups,
  enrichParseResultsWithDuplicates,
  assertNotDuplicate,
  DuplicateEobError,
};
