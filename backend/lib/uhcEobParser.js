function parseMoney(value) {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
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

const MONEY_RE = /\$[\d,]+\.\d{2}/g;
const CODE_AMOUNT_LINE_REGEX = /^([A-Z0-9]{2})\s*((?:\$[\d,]+\.\d{2}\s*)+)$/;
const MONEY_ONLY_LINE_REGEX = /^(?:\$[\d,]+\.\d{2}\s*)+$/;
const CODE_ONLY_REGEX = /^[A-Z0-9]{2}$/;
const DATE_LINE_REGEX =
  /^(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}\/\d{2}\/\d{4}))?$/;
const INLINE_DATE_REGEX =
  /^(.+?)\s+(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}\/\d{2}\/\d{4}))?$/;
const TOTAL_AMOUNTS_REGEX =
  /^Total amount\s+((?:\$[\d,]+\.\d{2}\s*)+)$/i;

function extractMoneyValues(text) {
  return [...String(text).matchAll(MONEY_RE)].map((m) => parseMoney(m[0]));
}

function amountsToFields(processingCode, amounts) {
  if (!amounts || amounts.length !== 9) return null;
  return {
    processing_code: processingCode || null,
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

function isIgnorableLine(line) {
  if (!line) return true;
  return (
    line.startsWith('Provider:') ||
    line.startsWith('Status:') ||
    line.startsWith('Patient account') ||
    line.startsWith('Claim number:') ||
    line.startsWith('Billed Savings') ||
    line.startsWith('Services received') ||
    line.startsWith('Got questions') ||
    line.startsWith('STD-EOB') ||
    line.startsWith('Page ') ||
    /^claim detail for/i.test(line) ||
    /^this statement$/i.test(line) ||
    line.includes('Amount you owe**')
  );
}

function nextIndex(lines, index) {
  let i = index;
  while (i < lines.length && isIgnorableLine(lines[i])) i += 1;
  return i;
}

function previousIndex(lines, index) {
  let i = index;
  while (i >= 0 && isIgnorableLine(lines[i])) i -= 1;
  return i;
}

function consumeWrappedAmounts(lines, startIndex, amounts) {
  let i = startIndex;
  const collected = amounts.slice();
  while (collected.length < 9 && i < lines.length) {
    i = nextIndex(lines, i);
    if (i >= lines.length || !MONEY_ONLY_LINE_REGEX.test(lines[i])) break;
    collected.push(...extractMoneyValues(lines[i]));
    i += 1;
  }
  return { amounts: collected.slice(0, 9), nextIndex: i };
}

function parseAmountLine(line) {
  const match = CODE_AMOUNT_LINE_REGEX.exec(line);
  if (!match) return null;
  return amountsToFields(match[1], extractMoneyValues(match[2]));
}

function readAmountFields(lines, startIndex) {
  let i = nextIndex(lines, startIndex);
  if (i >= lines.length) return { parsed: null, nextIndex: startIndex };

  let code = null;
  let amounts = [];
  const line = lines[i];

  const coded = CODE_AMOUNT_LINE_REGEX.exec(line);
  if (coded) {
    code = coded[1];
    amounts = extractMoneyValues(coded[2]);
    i += 1;
  } else if (CODE_ONLY_REGEX.test(line)) {
    const amountIndex = nextIndex(lines, i + 1);
    if (amountIndex >= lines.length || !MONEY_ONLY_LINE_REGEX.test(lines[amountIndex])) {
      return { parsed: null, nextIndex: startIndex };
    }
    code = line;
    amounts = extractMoneyValues(lines[amountIndex]);
    i = amountIndex + 1;
  } else {
    return { parsed: null, nextIndex: startIndex };
  }

  const wrapped = consumeWrappedAmounts(lines, i, amounts);
  const parsed = amountsToFields(code, wrapped.amounts);
  if (!parsed) return { parsed: null, nextIndex: startIndex };
  return { parsed, nextIndex: wrapped.nextIndex };
}

function readTotalAmountFields(lines, startIndex) {
  const line = lines[startIndex];
  const match = TOTAL_AMOUNTS_REGEX.exec(line);
  if (!match) return { parsed: null, nextIndex: startIndex + 1 };

  const wrapped = consumeWrappedAmounts(lines, startIndex + 1, extractMoneyValues(match[1]));
  return {
    parsed: amountsToFields(null, wrapped.amounts),
    nextIndex: wrapped.nextIndex,
  };
}

function makeClaimLine(description, startDate, endDate, parsedAmounts, processingCodes) {
  return {
    service_description: description,
    service_date_start: startDate,
    service_date_end: endDate,
    processing_code: parsedAmounts.processing_code,
    processing_code_description: parsedAmounts.processing_code
      ? processingCodes[parsedAmounts.processing_code] || null
      : null,
    provider_billed: parsedAmounts.provider_billed,
    amount_saved: parsedAmounts.amount_saved,
    plan_allowed: parsedAmounts.plan_allowed,
    plan_paid: parsedAmounts.plan_paid,
    applied_deductible: parsedAmounts.applied_deductible,
    copay: parsedAmounts.copay,
    coinsurance: parsedAmounts.coinsurance,
    plan_not_cover: parsedAmounts.plan_not_cover,
    amount_owed: parsedAmounts.amount_owed,
  };
}

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
  let fallbackTotal = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isIgnorableLine(line)) {
      i += 1;
      continue;
    }

    if (/^Total amount\b/i.test(line)) {
      const total = readTotalAmountFields(lines, i);
      if (total.parsed && !fallbackTotal) fallbackTotal = total.parsed;
      i = total.nextIndex;
      continue;
    }

    const dateOnly = DATE_LINE_REGEX.exec(line);
    if (dateOnly) {
      const descIndex = previousIndex(lines, i - 1);
      const description = descIndex >= 0 ? lines[descIndex] : '';
      const amounts = readAmountFields(lines, i + 1);
      if (
        amounts.parsed &&
        description &&
        !isIgnorableLine(description) &&
        !DATE_LINE_REGEX.test(description) &&
        !CODE_AMOUNT_LINE_REGEX.test(description)
      ) {
        claim.lines.push(
          makeClaimLine(
            description,
            parseDateMmDdYyyy(dateOnly[1]),
            dateOnly[2] ? parseDateMmDdYyyy(dateOnly[2]) : null,
            amounts.parsed,
            processingCodes
          )
        );
        i = amounts.nextIndex;
        continue;
      }
      i += 1;
      continue;
    }

    const inlineDate = INLINE_DATE_REGEX.exec(line);
    if (inlineDate && !CODE_AMOUNT_LINE_REGEX.test(line) && !/^Total amount\b/i.test(line)) {
      const description = inlineDate[1].trim();
      const amounts = readAmountFields(lines, i + 1);
      if (amounts.parsed && description && !isIgnorableLine(description)) {
        claim.lines.push(
          makeClaimLine(
            description,
            parseDateMmDdYyyy(inlineDate[2]),
            inlineDate[3] ? parseDateMmDdYyyy(inlineDate[3]) : null,
            amounts.parsed,
            processingCodes
          )
        );
        i = amounts.nextIndex;
        continue;
      }
    }

    i += 1;
  }

  if (claim.lines.length === 0 && fallbackTotal) {
    claim.lines.push(
      makeClaimLine(
        'Total amount',
        null,
        null,
        fallbackTotal,
        processingCodes
      )
    );
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

function sumClaimOwed(claim) {
  return roundMoney(
    (claim.lines || []).reduce((sum, line) => sum + Number(line.amount_owed || 0), 0)
  );
}

function applyHeaderOwedRemainder(statement, warnings) {
  const headerOwed = roundMoney(statement.total_amount_owed || 0);
  const lineOwed = roundMoney(
    statement.claims.reduce((sum, claim) => sum + sumClaimOwed(claim), 0)
  );
  const remainder = roundMoney(headerOwed - lineOwed);
  if (Math.abs(remainder) < 0.005) return;

  const emptyClaims = statement.claims.filter((claim) => (claim.lines || []).length === 0);
  if (emptyClaims.length === 1 && remainder > 0) {
    emptyClaims[0].lines.push(
      makeClaimLine(
        'Amount you owe',
        statement.service_period_start,
        null,
        amountsToFields(null, [0, 0, 0, 0, 0, 0, 0, 0, remainder]),
        {}
      )
    );
    warnings.push(
      `Attributed leftover statement owed $${remainder.toFixed(2)} to claim ${
        emptyClaims[0].claim_number || emptyClaims[0].provider_name
      }`
    );
    return;
  }

  warnings.push(
    `Statement owed $${headerOwed.toFixed(2)} does not match parsed line items $${lineOwed.toFixed(2)}`
  );
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

  const claimSection = normalizedText.split(/Claim detail for/i).slice(1).join('\n');
  const blocks = claimSection.split(/(?=Provider:)/i).filter((b) => b.includes('Claim number:'));

  const parsedClaims = [];
  for (const block of blocks) {
    const claim = parseClaimBlock(block, processingCodes, warnings);
    if (claim) parsedClaims.push(claim);
  }

  statement.claims = dedupeClaims(parsedClaims);
  applyHeaderOwedRemainder(statement, warnings);

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
  parseAmountLine,
};
