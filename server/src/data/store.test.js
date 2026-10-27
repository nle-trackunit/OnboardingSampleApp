const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { prepareImport } = require('../import/pipeline');
const { openDatabase } = require('./db');
const { createStore } = require('./store');
const { createCustomer, createDefaultOnboardingSteps } = require('../models');

describe('SQLite Store', () => {
  let store;

  beforeEach(() => {
    store = createStore(openDatabase(':memory:'));
  });

  it('should seed the example customer, tenant and onboarding state', () => {
    const customers = store.getCustomers();
    assert.strictEqual(customers.length, 1);
    assert.strictEqual(customers[0].name, 'Acme Corporation');
    assert.strictEqual(customers[0].contactEmail, 'onboarding@acme.example.com');

    assert.strictEqual(store.getTenantByCustomerId('cust_001').plan, 'professional');

    const state = store.getOnboardingState('cust_001');
    assert.strictEqual(state.progressPercent, 0);
    assert.deepStrictEqual(state.steps, createDefaultOnboardingSteps());
  });

  it('should not reseed a database that already has customers', () => {
    const db = openDatabase(':memory:');
    db.exec("DELETE FROM customers WHERE id = 'cust_001'");
    createStore(db).addCustomer(createCustomer({ id: 'cust_x', name: 'Other' }));

    const reopened = createStore(db);
    assert.deepStrictEqual(reopened.getCustomers().map(c => c.id), ['cust_x']);
  });

  it('should add and read back a customer', () => {
    const customer = createCustomer({ id: 'cust_002', name: 'Globex', industry: 'Energy' });
    store.addCustomer(customer);

    assert.deepStrictEqual(store.getCustomerById('cust_002'), customer);
    assert.strictEqual(store.getCustomerById('missing'), undefined);
  });

  it('should add and update onboarding state with ordered steps', () => {
    store.addCustomer(createCustomer({ id: 'cust_002', name: 'Globex' }));
    const steps = createDefaultOnboardingSteps();
    store.addOnboardingState({ customerId: 'cust_002', steps, progressPercent: 0 });

    const updatedSteps = steps.map(s => (s.id === 'step_1' ? { ...s, status: 'completed' } : s));
    const updated = store.updateOnboardingState('cust_002', { steps: updatedSteps, progressPercent: 25 });

    assert.strictEqual(updated.progressPercent, 25);
    assert.deepStrictEqual(updated.steps, updatedSteps);
    assert.strictEqual(store.getAllOnboardingStates().length, 2);
    assert.strictEqual(store.updateOnboardingState('missing', { progressPercent: 50 }), null);
  });

  it('should save, read back and overwrite a data mapping', () => {
    const mapping = {
      customerId: 'cust_001',
      entity: 'clients',
      sourceHeaders: ['Client ID', 'Client Name'],
      columns: { clientId: 'Client ID', name: 'Client Name' }
    };
    const saved = store.saveDataMapping(mapping);
    assert.deepStrictEqual(saved.columns, mapping.columns);
    assert.ok(saved.updatedAt);

    store.saveDataMapping({ ...mapping, columns: { clientId: 'Client Name', name: 'Client ID' } });
    assert.strictEqual(store.getDataMappings('cust_001').length, 1);
    assert.strictEqual(store.getDataMapping('cust_001', 'clients').columns.clientId, 'Client Name');
    assert.strictEqual(store.getDataMapping('cust_001', 'contacts'), undefined);
  });

  it('should roll back every write in a failed transaction', () => {
    assert.throws(() =>
      store.transaction(() => {
        store.addCustomer(createCustomer({ id: 'cust_003', name: 'Initech' }));
        store.addCustomer(createCustomer({ id: 'cust_003', name: 'Duplicate' }));
      })
    );
    assert.strictEqual(store.getCustomerById('cust_003'), undefined);
  });
});

describe('Tenant provisioning', () => {
  let db;
  let store;

  const step3 = (customerId) =>
    store.getOnboardingState(customerId).steps.find(s => s.id === 'step_3').status;

  function addQueuedCustomer(data) {
    const customer = store.addCustomer(createCustomer(data));
    store.addOnboardingState({ customerId: customer.id, steps: createDefaultOnboardingSteps() });
    return customer;
  }

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = createStore(db);
  });

  it('should provision a customer with no tenant row and complete step 3', () => {
    addQueuedCustomer({ id: 'cust_002', name: 'Globex', industry: 'Technology', region: 'emea' });

    const result = store.provisionTenant('cust_002', 'enterprise');

    assert.strictEqual(result.outcome, 'provisioned');
    assert.strictEqual(result.tenant.status, 'active');
    assert.strictEqual(result.tenant.plan, 'enterprise');
    assert.strictEqual(result.tenant.region, 'EMEA');
    assert.ok(result.tenant.provisionedAt);
    assert.strictEqual(step3('cust_002'), 'completed');
    assert.strictEqual(store.getOnboardingState('cust_002').progressPercent, 25);
  });

  it('should provision the seeded pending tenant in place rather than adding a second row', () => {
    const result = store.provisionTenant('cust_001', 'starter');

    assert.strictEqual(result.outcome, 'provisioned');
    assert.strictEqual(result.tenant.id, 'tenant_001');
    assert.strictEqual(result.tenant.region, 'North America');
    assert.strictEqual(store.getTenants().length, 1);
  });

  it('should return the existing tenant unchanged on a second attempt', () => {
    const first = store.provisionTenant('cust_001', 'professional').tenant;
    const second = store.provisionTenant('cust_001', 'enterprise');

    assert.strictEqual(second.outcome, 'already_provisioned');
    assert.deepStrictEqual(second.tenant, first);
    assert.strictEqual(store.getTenants().length, 1);
  });

  it('should block a customer whose region or industry is unmapped, naming the field', () => {
    addQueuedCustomer({ id: 'cust_mars', name: 'Mars Co', industry: 'Technology', region: 'Mars' });
    addQueuedCustomer({ id: 'cust_energy', name: 'Energy Co', industry: 'Energy', region: 'APAC' });

    assert.deepStrictEqual(store.provisionTenant('cust_mars', 'starter'), { outcome: 'unmapped', field: 'region' });
    assert.deepStrictEqual(store.provisionTenant('cust_energy', 'starter'), { outcome: 'unmapped', field: 'industry' });
    assert.strictEqual(store.getTenantByCustomerId('cust_mars'), undefined);
    assert.strictEqual(step3('cust_mars'), 'pending');
  });

  it('should report a missing customer without creating anything', () => {
    assert.deepStrictEqual(store.provisionTenant('missing', 'starter'), { outcome: 'customer_not_found' });
    assert.strictEqual(store.getTenants().length, 1);
  });

  it('should roll back the tenant write when completing step 3 fails mid-operation', () => {
    addQueuedCustomer({ id: 'cust_002', name: 'Globex', industry: 'Technology', region: 'EMEA' });
    db.exec(`
      CREATE TEMP TRIGGER fail_step_3 BEFORE INSERT ON onboarding_steps
      WHEN NEW.id = 'step_3' AND NEW.status = 'completed'
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `);

    assert.throws(() => store.provisionTenant('cust_002', 'starter'), /forced failure/);
    assert.throws(() => store.provisionTenant('cust_001', 'starter'), /forced failure/);

    assert.strictEqual(store.getTenantByCustomerId('cust_002'), undefined);
    assert.strictEqual(step3('cust_002'), 'pending');
    assert.strictEqual(store.getTenantByCustomerId('cust_001').status, 'pending');
    assert.strictEqual(store.getTenantByCustomerId('cust_001').provisionedAt, null);
    assert.strictEqual(step3('cust_001'), 'pending');

    db.exec('DROP TRIGGER fail_step_3');
    assert.strictEqual(store.provisionTenant('cust_002', 'starter').outcome, 'provisioned');
  });

  it('should enforce one tenant per customer and valid status and plan in the schema', () => {
    const insert = (row) => db.prepare(`
      INSERT INTO tenants (id, customer_id, status, plan, region, created_at, provisioned_at)
      VALUES (@id, @customerId, @status, @plan, @region, '2026-01-01', @provisionedAt)
    `).run({ region: null, provisionedAt: null, status: 'pending', plan: 'starter', ...row });
    addQueuedCustomer({ id: 'cust_002', name: 'Globex' });

    assert.throws(() => insert({ id: 't_dup', customerId: 'cust_001' }), /UNIQUE/);
    assert.throws(() => insert({ id: 't_status', customerId: 'cust_002', status: 'failed' }), /CHECK/);
    assert.throws(() => insert({ id: 't_plan', customerId: 'cust_002', plan: 'gold' }), /CHECK/);
    assert.throws(() => insert({ id: 't_active', customerId: 'cust_002', status: 'active' }), /CHECK/);
    assert.throws(() => insert({ id: 't_orphan', customerId: 'missing' }), /FOREIGN KEY/);
  });
});

describe('Tenant persistence', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should keep provisioned tenants and step 3 across a restart', () => {
    const dbPath = path.join(dir, 'onboarding.db');
    const db = openDatabase(dbPath);
    const tenant = createStore(db).provisionTenant('cust_001', 'enterprise').tenant;
    db.close();

    const reopened = createStore(openDatabase(dbPath));
    assert.deepStrictEqual(reopened.getTenantByCustomerId('cust_001'), tenant);
    assert.strictEqual(reopened.getOnboardingState('cust_001').steps[2].status, 'completed');
  });

  it('should migrate a tenants table from before provisioning, keeping one pending row per customer', () => {
    const dbPath = path.join(dir, 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '', contact_email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
      CREATE TABLE tenants (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        plan TEXT NOT NULL DEFAULT 'starter', created_at TEXT NOT NULL);
      INSERT INTO customers VALUES ('cust_001', 'Acme', 'Manufacturing', 'North America', 'a@acme.example.com', '2025-01-01');
      INSERT INTO tenants VALUES ('t_old', 'cust_001', 'failed', 'gold', '2025-01-01');
      INSERT INTO tenants VALUES ('t_new', 'cust_001', 'pending', 'professional', '2025-02-01');
    `);
    legacy.close();

    const store = createStore(openDatabase(dbPath));
    assert.deepStrictEqual(store.getTenants().map(t => [t.id, t.status, t.plan]), [['t_old', 'pending', 'starter']]);

    store.addOnboardingState({ customerId: 'cust_001', steps: createDefaultOnboardingSteps() });
    assert.strictEqual(store.provisionTenant('cust_001', 'professional').tenant.id, 't_old');
  });
});

describe('Data import', () => {
  const SAMPLE_DIR = path.join(__dirname, '..', '..', '..', 'sample-data', 'CustomerC_PremierBookkeeping');
  const FILES = { clients: 'clients', accounts: 'chart_of_accounts', contacts: 'contacts', transactions: 'transactions' };
  const sample = (entity) => fs.readFileSync(path.join(SAMPLE_DIR, `${FILES[entity]}.csv`), 'utf8');

  let db;
  let store;
  let tenantId;

  function importFile(entity, text = sample(entity)) {
    const prepared = prepareImport({ entity, text, lookups: store.importLookups(tenantId) });
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');
    return {
      prepared,
      result: store.commitImport({ customerId: 'cust_001', tenantId, entity, filename: `${entity}.csv`, contentHash, prepared })
    };
  }

  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = createStore(db);
    tenantId = store.provisionTenant('cust_001', 'starter').tenant.id;
  });

  it('should write every row and record the run with its counts and mapping', () => {
    const { result } = importFile('clients');

    assert.strictEqual(result.outcome, 'committed');
    assert.strictEqual(result.run.mappingId, 'premier-bookkeeping');
    assert.strictEqual(result.run.rowsValid, 12);
    assert.strictEqual(store.getImportState(tenantId).clients.rowCount, 12);
    assert.strictEqual(store.getImportState(tenantId).contacts.run, null);
  });

  it('should treat the same file again as a no-op and keep one run', () => {
    const first = importFile('clients').result;
    const second = importFile('clients').result;

    assert.strictEqual(second.outcome, 'duplicate');
    assert.deepStrictEqual(second.run, first.run);
    assert.strictEqual(count('import_runs'), 1);
    assert.strictEqual(count('tenant_clients'), 12);
  });

  it('should update rows by source ID on re-import and leave absent rows alone', () => {
    importFile('clients');
    const [header, firstRow] = sample('clients').split('\n');
    importFile('clients', `${header}\n${firstRow.replace('Artisan Bakery & Cafe', 'Artisan Bakery Ltd')}\n`);

    assert.strictEqual(count('tenant_clients'), 12);
    assert.strictEqual(count('import_runs'), 2);
    const name = db.prepare("SELECT name FROM tenant_clients WHERE source_id = 'PB-0001'").get().name;
    assert.strictEqual(name, 'Artisan Bakery Ltd');
  });

  it('should leave zero rows and no run when the commit fails part way', () => {
    importFile('clients');
    db.exec(`
      CREATE TEMP TRIGGER fail_contact BEFORE INSERT ON tenant_contacts
      WHEN NEW.source_id = 'CTR-010'
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
    `);

    assert.throws(() => importFile('contacts'), /forced failure/);
    assert.strictEqual(count('tenant_contacts'), 0);
    assert.strictEqual(store.getImportState(tenantId).contacts.run, null);

    db.exec('DROP TRIGGER fail_contact');
    assert.strictEqual(importFile('contacts').result.run.rowsValid, 20);
  });

  it('should keep leading-zero codes and enforce tenant parents in the schema', () => {
    importFile('clients');
    importFile('accounts');
    importFile('transactions');

    assert.strictEqual(db.prepare("SELECT parent_code FROM tenant_accounts WHERE code = '0011'").get().parent_code, '0010');
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM tenant_transactions WHERE account_code = '0010'").get().n, 3);
    assert.throws(() => db.prepare(`
      INSERT INTO tenant_contacts (tenant_id, source_id, client_source_id, import_run_id) VALUES (?, 'X', 'PB-9999', 1)
    `).run(tenantId), /FOREIGN KEY/);
  });

  it('should complete step 4 only once all four entity types are imported', () => {
    for (const entity of ['clients', 'accounts', 'contacts']) importFile(entity);
    assert.strictEqual(store.getOnboardingState('cust_001').steps[3].status, 'pending');

    importFile('transactions');
    const state = store.getOnboardingState('cust_001');
    assert.strictEqual(state.steps[3].status, 'completed');
    assert.strictEqual(state.progressPercent, 50);

    const steps = state.steps.map(s => ({ ...s, status: 'completed' }));
    store.updateOnboardingState('cust_001', { steps, progressPercent: 100 });
    assert.strictEqual(store.getOnboardingState('cust_001').progressPercent, 100);
  });

  it('should keep imported data across a restart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-import-'));
    try {
      const dbPath = path.join(dir, 'onboarding.db');
      db = openDatabase(dbPath);
      store = createStore(db);
      tenantId = store.provisionTenant('cust_001', 'starter').tenant.id;
      importFile('clients');
      db.close();

      const reopened = createStore(openDatabase(dbPath));
      assert.strictEqual(reopened.getImportState(tenantId).clients.rowCount, 12);
      assert.strictEqual(reopened.getImportState(tenantId).clients.run.rowsValid, 12);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
