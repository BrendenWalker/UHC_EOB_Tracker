function parseMoney(value) {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseDateMmDdYyyy(value) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseServicePeriod(text) {
  const match = text.match(
    /Services in this statement occurred\s+between\s+([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i
  );
  if (!match) return { start: null, end: null };
  return {
    start: new Date(match[1]).toISOString().slice(0, 10),
    end: new Date(match[2]).toISOString().slice(0, 10),
  };
}

function parseProcessingCodes(text) {
  const codes = {};
  const sectionMatch = text.match(
    /Explanation of your claim processing codes([\s\S]*?)(?:Claim detail for|Your rights as a member|Got questions\?)/i
  );
  if (!sectionMatch) return codes;

  const lines = sectionMatch[1].split('\n');
  let currentCode = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const codeMatch = line.match(/^([A-Z0-9]{2})\s+--\s+(.+)/);
    if (codeMatch) {
      currentCode = codeMatch[1];
      codes[currentCode] = codeMatch[2].trim();
      continue;
    }
    if (currentCode && line && !line.startsWith('STD-EOB') && !line.startsWith('Page')) {
      codes[currentCode] = `${codes[currentCode]} ${line}`.trim();
    }
  }
  return codes;
}

const AMOUNT_LINE_REGEX =
  /^([A-Z0-9]{2})\s*((?:\$[\d,]+\.\d{2}\s*){9})$/;

function parseAmountLine(line) {
  const match = AMOUNT_LINE_REGEX.exec(line);
  if (!match) return null;

  const amounts = [...match[2].matchAll(/\$[\d,]+\.\d{2}/g)].map((m) => parseMoney(m[0]));
  if (amounts.length !== 9) return null;

  return {
    processing_code: match[1],
    provider_billed: amounts[0],
    amount_saved: amounts[1],
    plan_allowed: amounts[2],
    plan_paid: amounts[3],
    applied_deductible: amounts[4],
    copay: amounts[5],
    coinsurance: amounts[6],
    plan_not_cover: amounts[7],
    amount_owed: amounts[8],
  };
}

const DATE_LINE_REGEX =
  /^(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}\/\d{2}\/\d{4}))?$/;

const TOTAL_LINE_REGEX =
  /^Total amount\s+(\$[\d,]+\.\d{2})/i;

function parseClaimBlock(block, processingCodes, warnings) {
  const providerMatch = block.match(/^Provider:\s*(.+?)(?:\n|$)/m);
  const statusMatch = block.match(/^Status:\s*(.+?)(?:\n|$)/m);
  const accountMatch = block.match(/Patient account number:\s*(\S+)/i);
  const claimNumberMatch = block.match(/Claim number:\s*(\S+)/i);

  if (!providerMatch) return null;

  const claim = {
    provider_name: providerMatch[1].trim(),
    network_status: statusMatch ? statusMatch[1].trim() : null,
    patient_account_number: accountMatch ? accountMatch[1].trim() : null,
    claim_number: claimNumberMatch ? claimNumberMatch[1].trim() : null,
    lines: [],
  };

  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (
      line.startsWith('Provider:') ||
      line.startsWith('Status:') ||
      line.startsWith('Patient account') ||
      line.startsWith('Claim number:') ||
      line.startsWith('Billed Savings') ||
      line.startsWith('Services received') ||
      line.startsWith('Total amount') ||
      line.startsWith('Got questions') ||
      line.startsWith('STD-EOB') ||
      line.startsWith('Page ') ||
      line.includes('Amount you owe**')
    ) {
      i += 1;
      continue;
    }

    const dateMatch = DATE_LINE_REGEX.exec(line);
    if (dateMatch && i > 0) {
      const description = lines[i - 1];
      const amountLine = lines[i + 1];
      const parsedAmounts = amountLine ? parseAmountLine(amountLine) : null;

      if (parsedAmounts && description && !description.startsWith('Provider')) {
        claim.lines.push({
          service_description: description,
          service_date_start: parseDateMmDdYyyy(dateMatch[1]),
          service_date_end: dateMatch[2] ? parseDateMmDdYyyy(dateMatch[2]) : null,
          processing_code: parsedAmounts.processing_code,
          processing_code_description: processingCodes[parsedAmounts.processing_code] || null,
          provider_billed: parsedAmounts.provider_billed,
          amount_saved: parsedAmounts.amount_saved,
          plan_allowed: parsedAmounts.plan_allowed,
          plan_paid: parsedAmounts.plan_paid,
          applied_deductible: parsedAmounts.applied_deductible,
          copay: parsedAmounts.copay,
          coinsurance: parsedAmounts.coinsurance,
          plan_not_cover: parsedAmounts.plan_not_cover,
          amount_owed: parsedAmounts.amount_owed,
        });
        i += 2;
        continue;
      }
    }

    if (TOTAL_LINE_REGEX.test(line)) {
      i += 1;
      continue;
    }

    i += 1;
  }

  if (claim.lines.length === 0) {
    warnings.push(`No line items parsed for claim ${claim.claim_number || claim.provider_name}`);
  }

  return claim;
}

function dedupeClaims(claims) {
  const seen = new Map();
  const result = [];

  for (const claim of claims) {
    const key = `${claim.claim_number || ''}|${claim.provider_name}|${claim.patient_account_number || ''}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      const existingSigs = new Set(
        existing.lines.map(
          (l) =>
            `${l.service_description}|${l.service_date_start}|${l.processing_code}|${l.amount_owed}`
        )
      );
      for (const line of claim.lines) {
        const sig = `${line.service_description}|${line.service_date_start}|${line.processing_code}|${line.amount_owed}`;
        if (!existingSigs.has(sig)) {
          existing.lines.push(line);
          existingSigs.add(sig);
        }
      }
      continue;
    }
    seen.set(key, claim);
    result.push(claim);
  }

  return result;
}

function normalizePdfText(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.replace(/^([A-Z0-9]{2})(\$)/, '$1 $2'))
    .join('\n');
}

function parseUhcEobText(text) {
  const warnings = [];
  const normalizedText = normalizePdfText(text);
  const processingCodes = parseProcessingCodes(normalizedText);
  const servicePeriod = parseServicePeriod(normalizedText);

  const memberMatch = normalizedText.match(/Member\/Patient:\s*(.+?)(?:\n|Member ID)/i);
  const memberIdMatch = normalizedText.match(/Member ID:\s*(\S+)/i);
  const eobRefMatch = normalizedText.match(/\n(\d{12,}-[A-Z0-9-]+)\nPage 1 of/i);
  const statementDateMatch = normalizedText.match(/Page 1 of \d+\n(\d{2}\/\d{2}\/\d{4})/);
  const providerBilledMatch = normalizedText.match(/Provider billed\s+(\$[\d,]+\.\d{2})/i);
  const totalOwedMatch = normalizedText.match(/Your total amount owed\s+(\$[\d,]+\.\d{2})/i);

  const statement = {
    statement_date: statementDateMatch ? parseDateMmDdYyyy(statementDateMatch[1]) : null,
    service_period_start: servicePeriod.start,
    service_period_end: servicePeriod.end,
    member_name: memberMatch ? memberMatch[1].trim() : null,
    member_id: memberIdMatch ? memberIdMatch[1].trim() : null,
    eob_reference: eobRefMatch ? eobRefMatch[1].trim() : null,
    total_provider_billed: providerBilledMatch ? parseMoney(providerBilledMatch[1]) : null,
    total_amount_owed: totalOwedMatch ? parseMoney(totalOwedMatch[1]) : null,
    claims: [],
  };

  const claimSection = normalizedText.split(/Claim detail for/i).slice(1).join('Claim detail for');
  const blocks = claimSection.split(/(?=Provider:)/i).filter((b) => b.includes('Claim number:'));

  const parsedClaims = [];
  for (const block of blocks) {
    const claim = parseClaimBlock(block, processingCodes, warnings);
    if (claim) parsedClaims.push(claim);
  }

  statement.claims = dedupeClaims(parsedClaims);

  if (!statement.member_name) {
    warnings.push('Could not parse member name from EOB header');
  }
  if (statement.claims.length === 0) {
    warnings.push('No claims found in PDF — verify this is a UHC STD-EOB document');
  }

  return { statement, warnings };
}

async function parseUhcEobPdf(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return parseUhcEobText(data.text);
}

module.exports = {
  parseUhcEobText,
  parseUhcEobPdf,
  parseMoney,
  parseDateMmDdYyyy,
};
