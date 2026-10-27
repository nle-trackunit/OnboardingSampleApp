const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseDate, parseAmount, parseBoolean, translate, formatPersonName } = require('./normalize');
const { MAPPINGS } = require('./mappings');

describe('parseDate', () => {
  it('should store all three customer formats as the same ISO date', () => {
    assert.deepStrictEqual(parseDate('01/15/2024', 'MDY'), { value: '2024-01-15' });
    assert.deepStrictEqual(parseDate('2024-01-15', 'YMD'), { value: '2024-01-15' });
    assert.deepStrictEqual(parseDate('15-01-2024', 'DMY'), { value: '2024-01-15' });
  });

  it('should take day/month order from the mapping, never guess', () => {
    assert.deepStrictEqual(parseDate('03/04/2024', 'MDY'), { value: '2024-03-04' });
    assert.deepStrictEqual(parseDate('03-04-2024', 'DMY'), { value: '2024-04-03' });
  });

  it('should reject impossible dates and the wrong format', () => {
    assert.match(parseDate('15/01/2024', 'MDY').error, /expected MM\/DD\/YYYY/);
    assert.ok(parseDate('31-02-2024', 'DMY').error);
    assert.ok(parseDate('2024-01-15', 'DMY').error);
  });
});

describe('parseAmount', () => {
  it('should store amounts with or without decimals at a fixed scale in minor units', () => {
    assert.deepStrictEqual(parseAmount('2500000.00'), { value: 250000000 });
    assert.deepStrictEqual(parseAmount('1850000'), { value: 185000000 });
    assert.deepStrictEqual(parseAmount('12.5'), { value: 1250 });
    assert.deepStrictEqual(parseAmount('-0.07'), { value: -7 });
  });

  it('should reject values that are not plain decimal amounts', () => {
    assert.ok(parseAmount('1,000').error);
    assert.ok(parseAmount('£12').error);
    assert.ok(parseAmount('1.234').error);
  });
});

describe('parseBoolean', () => {
  it('should read 1/0, Y/N, Yes/No and Active/Inactive', () => {
    for (const value of ['1', 'Y', 'yes', 'Active']) assert.strictEqual(parseBoolean(value), true);
    for (const value of ['0', 'n', 'No', 'inactive']) assert.strictEqual(parseBoolean(value), false);
  });

  it('should return undefined for anything else', () => {
    assert.strictEqual(parseBoolean('maybe'), undefined);
  });
});

describe('formatPersonName', () => {
  it('should turn "Last, First" into "First Last" only when the mapping says so', () => {
    assert.strictEqual(formatPersonName('Williams, Robert', 'last_first'), 'Robert Williams');
    assert.strictEqual(formatPersonName('John Smith', 'last_first'), 'John Smith');
    assert.strictEqual(formatPersonName('Smith, John', 'first_last'), 'Smith, John');
  });
});

describe('translation tables', () => {
  const [a, b, c] = MAPPINGS;
  const all = (table, values) => values.map((v, i) => translate([a, b, c][i].values[table], v));

  it('should map each dialect to one canonical value, ignoring case', () => {
    assert.deepStrictEqual(all('clientStatus', ['Active', 'A', 'ACTIVE']), ['active', 'active', 'active']);
    assert.deepStrictEqual(all('clientStatus', ['Inactive', 'I', 'DORMANT']), ['inactive', 'inactive', 'inactive']);
    assert.deepStrictEqual(all('clientStatus', ['Pending', 'P', 'SUSPENDED']), ['pending', 'pending', 'pending']);
    assert.deepStrictEqual(all('entityType', ['Sole Proprietorship', 'SOLE', 'Sole Trader']), Array(3).fill('sole_proprietor'));
    assert.deepStrictEqual(all('debitCredit', ['Debit', 'DR', 'D']), ['debit', 'debit', 'debit']);
    assert.deepStrictEqual(all('debitCredit', ['Credit', 'CR', 'C']), ['credit', 'credit', 'credit']);
    assert.deepStrictEqual(all('transactionStatus', ['Cleared', 'POSTED', 'Reconciled']), Array(3).fill('completed'));
    assert.deepStrictEqual(all('transactionStatus', ['Pending', 'PENDING', 'Unreconciled']), Array(3).fill('pending'));
    assert.deepStrictEqual(all('transactionStatus', ['Voided', 'VOID', 'Cancelled']), Array(3).fill('cancelled'));
    assert.deepStrictEqual(all('paymentMethod', ['Check', 'CHECK', 'Cheque']), Array(3).fill('check'));
    assert.deepStrictEqual(all('paymentMethod', ['ACH', 'EFT', 'BACS']), Array(3).fill('ach'));
    assert.deepStrictEqual(all('accountType', ['Expense', 'EXPENSE', 'Overheads']), Array(3).fill('expense'));
    assert.deepStrictEqual(all('accountType', ['Equity', 'EQUITY', 'Capital']), Array(3).fill('equity'));
    assert.deepStrictEqual(all('contactActive', ['Active', 'Y', 'Active']), [true, true, true]);
    assert.deepStrictEqual(all('contactActive', ['Inactive', 'N', 'Dormant']), [false, false, false]);
    assert.strictEqual(translate(a.values.clientStatus, ' active '), 'active');
  });

  it('should return undefined for a value in no table', () => {
    assert.strictEqual(translate(a.values.clientStatus, 'Archived'), undefined);
  });
});
