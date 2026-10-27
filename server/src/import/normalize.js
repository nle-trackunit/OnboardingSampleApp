/**
 * Value normalizers shared by every dialect
 */

const DATE_PATTERNS = {
  MDY: { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: ['month', 'day', 'year'], format: 'MM/DD/YYYY' },
  YMD: { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, parts: ['year', 'month', 'day'], format: 'YYYY-MM-DD' },
  DMY: { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, parts: ['day', 'month', 'year'], format: 'DD-MM-YYYY' }
};

/**
 * Parses a date whose day/month order is given by the mapping, never guessed
 * @param {string} value
 * @param {'MDY'|'YMD'|'DMY'} order
 * @returns {{ value: string } | { error: string }} ISO date (YYYY-MM-DD)
 */
function parseDate(value, order) {
  const pattern = DATE_PATTERNS[order];
  const match = pattern.regex.exec(value.trim());
  const invalid = { error: `invalid date "${value}" (expected ${pattern.format})` };
  if (!match) return invalid;

  const parts = {};
  pattern.parts.forEach((name, i) => { parts[name] = Number(match[i + 1]); });
  const { year, month, day } = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return invalid;
  }
  return { value: date.toISOString().slice(0, 10) };
}

const AMOUNT_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a decimal amount into integer minor units (cents/pence), so money is never a float
 * @param {string} value
 * @returns {{ value: number } | { error: string }}
 */
function parseAmount(value) {
  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) return { error: `invalid amount "${value}"` };
  const [, sign, whole, fraction = ''] = match;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return { value: sign ? -minor : minor };
}

const TRUE_VALUES = new Set(['1', 'y', 'yes', 'true', 'active']);
const FALSE_VALUES = new Set(['0', 'n', 'no', 'false', 'inactive']);

/**
 * Reads the boolean conventions found in customer files: 1/0, Y/N, Yes/No, Active/Inactive
 * @param {string} value
 * @returns {boolean|undefined} undefined when the value is not a recognized boolean
 */
function parseBoolean(value) {
  const key = value.trim().toLowerCase();
  if (TRUE_VALUES.has(key)) return true;
  if (FALSE_VALUES.has(key)) return false;
  return undefined;
}

/**
 * Looks a value up in a translation table, ignoring case and surrounding whitespace
 * @param {Object<string, *>} table
 * @param {string} value
 * @returns {*} The canonical value, or undefined when the table has no entry
 */
function translate(table, value) {
  const key = value.trim().toLowerCase();
  const entry = Object.keys(table).find(k => k.toLowerCase() === key);
  return entry === undefined ? undefined : table[entry];
}

/**
 * Normalizes a person's name to "First Last"
 * @param {string} value
 * @param {'first_last'|'last_first'} order - 'last_first' reads "Williams, Robert"
 */
function formatPersonName(value, order) {
  const trimmed = value.trim();
  if (order !== 'last_first' || !trimmed.includes(',')) return trimmed;
  const [last, ...rest] = trimmed.split(',');
  return `${rest.join(',').trim()} ${last.trim()}`.trim();
}

module.exports = { parseDate, parseAmount, parseBoolean, translate, formatPersonName };
