// ── Dynamic / predefined variable registry ────────────────────────────────────
// resolveDynamicVariable() returns a freshly generated value for every known
// dynamic variable name, or null if the name is not dynamic (so callers fall
// through to environment lookup as normal).

const FIRST_NAMES = [
  'James', 'John', 'Sarah', 'Emma', 'Michael', 'Jessica', 'David', 'Emily',
  'Daniel', 'Olivia', 'Matthew', 'Sophia', 'Christopher', 'Ava', 'Andrew',
  'Isabella', 'Ryan', 'Mia', 'Tyler', 'Charlotte', 'Thabo', 'Sipho', 'Nomsa',
  'Zanele', 'Lerato', 'Bongani', 'Ayanda', 'Nkosi', 'Fatima', 'Priya',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Dlamini', 'Nkosi', 'Zulu', 'Mthembu', 'Ndlovu', 'Khumalo', 'Mokoena',
  'Molefe', 'Sithole', 'Mahlangu', 'Ngcobo', 'Botha', 'Patel', 'Singh',
];

function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

function generateSAIDNumber(): string {
  // Random DOB between 18 and 65 years ago
  const now = new Date();
  const ageYears = 18 + rand(47);
  const dob = new Date(now.getFullYear() - ageYears, rand(12), 1 + rand(28));

  const yy = String(dob.getFullYear()).slice(2);
  const mm = String(dob.getMonth() + 1).padStart(2, '0');
  const dd = String(dob.getDate()).padStart(2, '0');
  const seq = String(rand(10000)).padStart(4, '0');
  const citizenship = '0';
  const z = '8';

  const partial = `${yy}${mm}${dd}${seq}${citizenship}${z}`;

  // SA ID Luhn checksum:
  // A = sum of digits at 0-indexed even positions (0,2,4,6,8,10)
  // B = concatenate digits at 0-indexed odd positions (1,3,5,7,9,11), double as integer, sum its digits
  let a = 0;
  let evenStr = '';
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) a += parseInt(partial[i]);
    else evenStr += partial[i];
  }
  const doubled = parseInt(evenStr) * 2;
  let b = 0;
  for (const ch of String(doubled)) b += parseInt(ch);
  const total = a + b;
  const checksum = (10 - (total % 10)) % 10;

  return `${partial}${checksum}`;
}

export function resolveDynamicVariable(name: string): string | null {
  switch (name) {
    // ── UUID ──────────────────────────────────────────────────────────────────
    case 'randomUuid':
    case '$guid':
      return crypto.randomUUID();

    // ── ISO date/time ─────────────────────────────────────────────────────────
    case 'currentISODateTimeWithTZ':
    case '$isoTimestamp':
      return new Date().toISOString();

    case 'currentISODateTimeWithoutTZ':
      return new Date().toISOString().slice(0, 19);

    case 'currentISODate':
      return new Date().toISOString().slice(0, 10);

    case 'currentISOTime':
      return new Date().toISOString().slice(11, 19);

    // ── Unix timestamps ───────────────────────────────────────────────────────
    case 'currentUnixTimestampMs':
      return String(Date.now());

    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));

    // ── Random primitives ─────────────────────────────────────────────────────
    case 'randomInt':
    case '$randomInt':
      return String(rand(1000));

    case 'randomBoolean':
    case '$randomBoolean':
      return String(Math.random() < 0.5);

    case 'randomFloat':
    case '$randomFloat':
      return (Math.random() * 1000).toFixed(2);

    // ── Random personal data ──────────────────────────────────────────────────
    case 'randomEmail':
    case '$randomEmail':
      return `user${rand(99999)}@example.com`;

    case 'randomFirstName':
    case '$randomFirstName':
      return FIRST_NAMES[rand(FIRST_NAMES.length)];

    case 'randomLastName':
    case '$randomLastName':
      return LAST_NAMES[rand(LAST_NAMES.length)];

    case 'randomFullName':
    case '$randomFullName':
      return `${FIRST_NAMES[rand(FIRST_NAMES.length)]} ${LAST_NAMES[rand(LAST_NAMES.length)]}`;

    // ── South Africa specific ─────────────────────────────────────────────────
    case 'randomSAIDNumber':
      return generateSAIDNumber();

    default:
      return null;
  }
}

// Canonical PostRebel names (used for autocomplete suggestions)
export const DYNAMIC_VAR_NAMES_PRIMARY = [
  'randomUuid',
  'currentISODateTimeWithTZ',
  'currentISODateTimeWithoutTZ',
  'currentISODate',
  'currentISOTime',
  'currentUnixTimestampMs',
  'randomInt',
  'randomBoolean',
  'randomFloat',
  'randomEmail',
  'randomFirstName',
  'randomLastName',
  'randomFullName',
  'randomSAIDNumber',
];

// Postman-compatible aliases (also shown in autocomplete for migrating users)
export const DYNAMIC_VAR_NAMES_POSTMAN = [
  '$guid',
  '$isoTimestamp',
  '$timestamp',
  '$randomInt',
  '$randomBoolean',
  '$randomFloat',
  '$randomEmail',
  '$randomFirstName',
  '$randomLastName',
  '$randomFullName',
];

export const ALL_DYNAMIC_VAR_NAMES = [
  ...DYNAMIC_VAR_NAMES_PRIMARY,
  ...DYNAMIC_VAR_NAMES_POSTMAN,
];
