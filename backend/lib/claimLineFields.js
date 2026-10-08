class InvalidLineFieldError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidLineFieldError';
    this.statusCode = 400;
  }
}

function parseOptionalMoney(value) {
  if (value === undefined) return { present: false };

  if (value === null || value === '') {
    return { present: true, value: null };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new InvalidLineFieldError('Invalid billed amount');
    }
    return { present: true, value };
  }

  const trimmed = String(value).trim();
  if (trimmed === '') return { present: true, value: null };

  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    throw new InvalidLineFieldError('Invalid billed amount');
  }
  return { present: true, value: num };
}

function parseOptionalNotes(value) {
  if (value === undefined) return { present: false };
  if (value === null) return { present: true, value: null };
  const text = String(value).trim();
  return { present: true, value: text === '' ? null : text };
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    console.error(`FAIL ${label}: ${actualJson} !== ${expectedJson}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok ${label}`);
}

if (require.main === module) {
  assertDeepEqual(parseOptionalMoney(undefined), { present: false }, 'money missing stays unset');
  assertDeepEqual(parseOptionalMoney(''), { present: true, value: null }, 'money empty string is NULL');
  assertDeepEqual(parseOptionalMoney(null), { present: true, value: null }, 'money null is NULL');
  assertDeepEqual(parseOptionalMoney(0), { present: true, value: 0 }, 'money 0 is kept');
  assertDeepEqual(parseOptionalMoney('0'), { present: true, value: 0 }, 'money "0" is kept');
  assertDeepEqual(parseOptionalMoney('12.50'), { present: true, value: 12.5 }, 'money decimal');
  assertDeepEqual(parseOptionalNotes(undefined), { present: false }, 'notes missing stays unset');
  assertDeepEqual(parseOptionalNotes(''), { present: true, value: null }, 'notes empty is NULL');
  assertDeepEqual(parseOptionalNotes('  billed mismatch'), { present: true, value: 'billed mismatch' }, 'notes trim whitespace');

  try {
    parseOptionalMoney('nope');
    console.error('FAIL money should reject non-numeric');
    process.exitCode = 1;
  } catch (error) {
    if (error.statusCode !== 400) {
      console.error('FAIL money reject should be 400');
      process.exitCode = 1;
    } else {
      console.log('ok money rejects non-numeric');
    }
  }

  process.exit(process.exitCode || 0);
}

module.exports = {
  InvalidLineFieldError,
  parseOptionalMoney,
  parseOptionalNotes,
};
