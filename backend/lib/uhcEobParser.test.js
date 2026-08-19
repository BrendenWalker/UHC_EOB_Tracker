const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseUhcEobText } = require('./uhcEobParser');

function header({ owed = '$19.62', billed = '$970.15' } = {}) {
  return `
Member/Patient: BRENDEN WALKER
Member ID: 939160712
000001481351632-A-S-N-CP-E
Page 1 of 3
06/16/2026
Provider billed ${billed}
Your total amount owed ${owed}
Services in this statement occurred between April 25, 2026 - May 29, 2026
`.trim();
}

function codes() {
  return `
Explanation of your claim processing codes
UG -- NETWORK DISCOUNT APPLIED.
QI -- BENEFITS FOR THIS SERVICE ARE DENIED.
`.trim();
}

describe('parseUhcEobText', () => {
  it('parses a standard claim amount line', () => {
    const text = `
${header({ owed: '$1,653.00', billed: '$13,250.57' })}

Claim detail for this statement
Provider: SAINT MARYS REGIONAL
Status: Network
Patient account number: H73000039797200
Claim number: FT6096857201
INPATIENT SERVICES
04/25/2026 - 04/26/2026
QC $5,008.46 $3,355.46 $1,653.00 $0.00 $1,653.00 $0.00 $0.00 $0.00 $1,653.00
Total amount $5,008.46 $3,355.46 $1,653.00 $0.00 $1,653.00 $0.00 $0.00 $0.00 $1,653.00

${codes()}
`;
    const { statement, warnings } = parseUhcEobText(text);
    const claim = statement.claims[0];
    assert.equal(claim.claim_number, 'FT6096857201');
    assert.equal(claim.lines.length, 1);
    assert.equal(claim.lines[0].amount_owed, 1653);
    assert.equal(claim.lines[0].provider_billed, 5008.46);
    assert.equal(warnings.some((w) => w.includes('does not match')), false);
  });

  it('skips repeated page headers and joins a wrapped you-owe amount', () => {
    const text = `
${header()}

Claim detail for this statement
Provider: SAINT MARYS REGIONAL
Status: Network
Patient account number: H73000040476300
Claim number: FU6811124201
HOSPITAL SERVICES
04/25/2026
Page 2 of 3
Claim detail for this statement
UG $196.25 $0.00 $196.25 $176.63 $0.00 $0.00 $19.62 $0.00
$19.62
Total amount $196.25 $0.00 $196.25 $176.63 $0.00 $0.00 $19.62 $0.00 $19.62

Provider: M MARINACCIO
Status: Network
Patient account number: S3005963670
Claim number: FT4581467601
INPATIENT VISIT
04/25/2026
QI $773.90 $773.90 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00

${codes()}
`;
    const { statement } = parseUhcEobText(text);
    const saintMarys = statement.claims.find((c) => c.claim_number === 'FU6811124201');
    const marinaccio = statement.claims.find((c) => c.claim_number === 'FT4581467601');

    assert.equal(saintMarys.lines.length, 1);
    assert.equal(saintMarys.lines[0].service_description, 'HOSPITAL SERVICES');
    assert.equal(saintMarys.lines[0].amount_owed, 19.62);
    assert.equal(saintMarys.lines[0].provider_billed, 196.25);
    assert.equal(marinaccio.lines[0].amount_owed, 0);
  });

  it('uses the claim total row when service lines cannot be parsed', () => {
    const text = `
${header()}

Claim detail for this statement
Provider: SAINT MARYS REGIONAL
Status: Network
Patient account number: H73000040476300
Claim number: FU6811124201
Total amount $196.25 $0.00 $196.25 $176.63 $0.00 $0.00 $19.62 $0.00 $19.62

Provider: M MARINACCIO
Status: Network
Patient account number: S3005963670
Claim number: FT4581467601
INPATIENT VISIT
04/25/2026
QI $773.90 $773.90 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00

${codes()}
`;
    const { statement } = parseUhcEobText(text);
    const saintMarys = statement.claims.find((c) => c.claim_number === 'FU6811124201');
    assert.equal(saintMarys.lines[0].service_description, 'Total amount');
    assert.equal(saintMarys.lines[0].amount_owed, 19.62);
  });

  it('attributes leftover statement owed to the only claim with no lines', () => {
    const text = `
${header()}

Claim detail for this statement
Provider: SAINT MARYS REGIONAL
Status: Network
Patient account number: H73000040476300
Claim number: FU6811124201

Provider: M MARINACCIO
Status: Network
Patient account number: S3005963670
Claim number: FT4581467601
INPATIENT VISIT
04/25/2026
QI $773.90 $773.90 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00 $0.00

${codes()}
`;
    const { statement, warnings } = parseUhcEobText(text);
    const saintMarys = statement.claims.find((c) => c.claim_number === 'FU6811124201');
    assert.equal(saintMarys.lines.length, 1);
    assert.equal(saintMarys.lines[0].amount_owed, 19.62);
    assert.equal(
      warnings.some((w) => w.includes('Attributed leftover statement owed $19.62')),
      true
    );
  });
});
