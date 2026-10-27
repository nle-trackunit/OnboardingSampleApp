const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { prepareImport } = require('./pipeline');

const SAMPLE_DIR = path.join(__dirname, '..', '..', '..', 'sample-data');
const FILES = { clients: 'clients', accounts: 'chart_of_accounts', contacts: 'contacts', transactions: 'transactions' };
const sample = (customer, entity) => fs.readFileSync(path.join(SAMPLE_DIR, customer, `${FILES[entity]}.csv`), 'utf8');

const NO_PARENTS = { hasClient: () => false, hasAccount: () => false };
const ALL_PARENTS = { hasClient: () => true, hasAccount: () => true };

/** Prepares a customer's four files in import order, as if each earlier file had been committed */
function prepareCustomer(customer) {
  const clients = new Set();
  const accounts = new Set();
  const lookups = { hasClient: id => clients.has(id), hasAccount: code => accounts.has(code) };
  const results = {};
  for (const entity of ['clients', 'accounts', 'contacts', 'transactions']) {
    results[entity] = prepareImport({ entity, text: sample(customer, entity), lookups });
    for (const { record } of results[entity].rows) {
      if (entity === 'clients') clients.add(record.sourceId);
      if (entity === 'accounts') accounts.add(record.code);
    }
  }
  return results;
}

describe('prepareImport against sample-data', () => {
  const expected = {
    CustomerA_ABCAccounting: { clients: 10, accounts: 39, contacts: 15, transactions: 25 },
    CustomerB_XYZFinancialServices: { clients: 12, accounts: 39, contacts: 18, transactions: 25 },
    CustomerC_PremierBookkeeping: { clients: 12, accounts: 39, contacts: 20, transactions: 25 }
  };

  for (const [customer, counts] of Object.entries(expected)) {
    it(`should import every row of all four ${customer} files`, () => {
      const results = prepareCustomer(customer);
      for (const [entity, count] of Object.entries(counts)) {
        const result = results[entity];
        assert.strictEqual(result.error, undefined, `${entity}: ${result.error}`);
        assert.deepStrictEqual(
          { valid: result.rowsValid, rejected: result.rejected, flagged: result.rowsFlagged },
          { valid: count, rejected: [], flagged: 0 },
          entity
        );
      }
    });
  }

  it('should rejoin Customer B mainContact in all 12 clients without shifting columns', () => {
    const result = prepareImport({ entity: 'clients', text: sample('CustomerB_XYZFinancialServices', 'clients'), lookups: NO_PARENTS });
    assert.strictEqual(result.rowsValid, 12);
    const apex = result.rows[0].record;
    assert.strictEqual(apex.primaryContactName, 'Robert Williams');
    assert.strictEqual(apex.paymentTerms, 'net_30');
    assert.strictEqual(apex.status, 'active');
    assert.ok(result.rows.every(r => !r.record.primaryContactName.includes(',')));
  });

  it('should rejoin Customer A account 6300 description so its parent is 6000, not " gas"', () => {
    const result = prepareImport({ entity: 'accounts', text: sample('CustomerA_ABCAccounting', 'accounts'), lookups: NO_PARENTS });
    const utilities = result.rows.find(r => r.record.code === '6300').record;
    assert.strictEqual(utilities.description, 'Electric, gas, water');
    assert.strictEqual(utilities.parentCode, '6000');
    assert.strictEqual(utilities.type, 'expense');
  });

  it('should keep Customer C leading-zero codes as text in accounts and transactions', () => {
    const results = prepareCustomer('CustomerC_PremierBookkeeping');
    assert.ok(results.accounts.rows.some(r => r.record.code === '0010'));
    assert.strictEqual(results.accounts.rows.find(r => r.record.code === '0011').record.parentCode, '0010');
    assert.ok(results.transactions.rows.some(r => r.record.accountCode === '0010'));
  });

  it('should record the currency from the mapping and amounts in minor units', () => {
    const c = prepareCustomer('CustomerC_PremierBookkeeping').transactions.rows[0].record;
    assert.deepStrictEqual([c.date, c.amount, c.currency, c.entryType], ['2024-01-15', 425000, 'GBP', 'credit']);
    const a = prepareCustomer('CustomerA_ABCAccounting').transactions.rows[0].record;
    assert.deepStrictEqual([a.date, a.amount, a.currency], ['2024-01-15', 1500000, 'USD']);
  });
});

describe('prepareImport rules', () => {
  const header = 'Account Number,Account Name,Account Type,Sub Type,Normal Balance,Status,Description,Parent Account';

  it('should reject a mid-row overflow it cannot rejoin unambiguously, with line and raw text', () => {
    const raw = '7000,Misc, Other,Expense,Operating Expense,Debit,Active,Odds, ends,';
    const result = prepareImport({ entity: 'accounts', text: `${header}\n${raw}\n`, lookups: NO_PARENTS });
    assert.strictEqual(result.rowsValid, 0);
    assert.deepStrictEqual(result.rejected, [{ line: 2, raw, reason: 'column count mismatch (10 fields, expected 8)' }]);
  });

  it('should reject a row with too few fields', () => {
    const result = prepareImport({ entity: 'accounts', text: `${header}\n7000,Misc\n`, lookups: NO_PARENTS });
    assert.match(result.rejected[0].reason, /column count mismatch/);
  });

  it('should flag an unmappable picklist value for review, keeping the raw value', () => {
    const text = `${header}\n7000,Misc,Expense,Other,Sideways,Active,,\n`;
    const result = prepareImport({ entity: 'accounts', text, lookups: NO_PARENTS });
    assert.strictEqual(result.rowsValid, 1);
    assert.deepStrictEqual(result.flagged, [{ line: 2, sourceId: '7000', review: [{ field: 'normalBalance', raw: 'Sideways' }] }]);
    assert.strictEqual(result.rows[0].record.normalBalance, null);
  });

  it('should reject rows whose parent is not in the tenant, and keep the rest', () => {
    const text = [
      'Contact ID,Client ID,First Name,Last Name,Email,Phone,Role,Status,Preferred Contact Method,Department',
      'CT001,C001,John,Smith,j@x.com,1,Owner,Active,Email,Exec',
      'CT002,C099,Jane,Doe,d@x.com,2,CFO,Active,Email,Finance'
    ].join('\n');
    const result = prepareImport({ entity: 'contacts', text, lookups: { hasClient: id => id === 'C001', hasAccount: () => false } });
    assert.strictEqual(result.rowsValid, 1);
    assert.strictEqual(result.rejected[0].reason, 'client C099 not found in this tenant');
  });

  it('should reject a child account whose in-file parent was rejected', () => {
    const text = `${header}\n1000,Cash,Asset,Current,Debit,Active,,\n1010,Petty,Asset,Current,Debit,Active,,1000\n1000,Dup,Asset,Current,Debit,Active,,\n1020,Bank,Asset,Current,Debit,Active,,9999\n`;
    const result = prepareImport({ entity: 'accounts', text, lookups: NO_PARENTS });
    assert.deepStrictEqual(result.rows.map(r => r.record.code), ['1000', '1010']);
    assert.deepStrictEqual(result.rejected.map(r => r.reason), ['duplicate 1000 in this file', 'parent account 9999 not found in this tenant']);
  });

  it('should refuse unknown headers, listing them, and name a file of another entity type', () => {
    const unknown = prepareImport({ entity: 'clients', text: 'foo,Client ID\n1,2\n', lookups: ALL_PARENTS });
    assert.strictEqual(unknown.error, 'unrecognized');
    assert.deepStrictEqual(unknown.unmatchedHeaders, ['foo']);

    const wrong = prepareImport({ entity: 'transactions', text: sample('CustomerA_ABCAccounting', 'contacts'), lookups: ALL_PARENTS });
    assert.deepStrictEqual(wrong, { error: 'wrong_entity', detectedEntity: 'contacts' });
  });

  it('should report zero rows for a header-only file, and refuse empty or binary input', () => {
    const headerOnly = prepareImport({ entity: 'accounts', text: `\uFEFF${header}\r\n\r\n`, lookups: NO_PARENTS });
    assert.deepStrictEqual([headerOnly.rowsRead, headerOnly.rowsValid, headerOnly.rowsRejected], [0, 0, 0]);
    assert.strictEqual(prepareImport({ entity: 'accounts', text: '', lookups: NO_PARENTS }).error, 'unreadable');
    assert.strictEqual(prepareImport({ entity: 'accounts', text: 'PK\u0003\u0004\u0000', lookups: NO_PARENTS }).error, 'unreadable');
  });
});
