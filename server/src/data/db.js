/**
 * SQLite database connection, schema and seed data
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  TENANT_STATUSES,
  TENANT_PLANS
} = require('../models');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'onboarding.db');

const sqlList = (values) => values.map(v => `'${v}'`).join(', ');

function tenantsTableSql(name) {
  return `
  CREATE TABLE IF NOT EXISTS ${name} (
    id             TEXT PRIMARY KEY,
    customer_id    TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${sqlList(TENANT_STATUSES)})),
    plan           TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN (${sqlList(TENANT_PLANS)})),
    region         TEXT,
    created_at     TEXT NOT NULL,
    provisioned_at TEXT,
    CHECK (status <> 'active' OR (region IS NOT NULL AND region <> '' AND provisioned_at IS NOT NULL))
  );`;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS customers (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    industry      TEXT NOT NULL DEFAULT '',
    region        TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  ${tenantsTableSql('tenants')}

  CREATE TABLE IF NOT EXISTS onboarding_states (
    customer_id      TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    progress_percent INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS onboarding_steps (
    customer_id TEXT NOT NULL REFERENCES onboarding_states(customer_id) ON DELETE CASCADE,
    id          TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    step_order  INTEGER NOT NULL,
    PRIMARY KEY (customer_id, id)
  );

  CREATE TABLE IF NOT EXISTS data_mappings (
    customer_id    TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entity         TEXT NOT NULL,
    source_headers TEXT NOT NULL,
    columns        TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (customer_id, entity)
  );

  CREATE TABLE IF NOT EXISTS import_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity       TEXT NOT NULL CHECK (entity IN ('clients', 'accounts', 'contacts', 'transactions')),
    filename     TEXT NOT NULL,
    mapping_id   TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    rows_read     INTEGER NOT NULL,
    rows_valid    INTEGER NOT NULL,
    rows_rejected INTEGER NOT NULL,
    rows_flagged  INTEGER NOT NULL,
    committed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_import_runs_tenant_entity ON import_runs(tenant_id, entity);

  -- Amounts are integer minor units (cents/pence) with an explicit currency; codes are TEXT so
  -- leading zeros survive. UNIQUE (tenant_id, source id) makes re-imports update, not duplicate.
  CREATE TABLE IF NOT EXISTS tenant_clients (
    tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id            TEXT NOT NULL,
    name                 TEXT NOT NULL,
    entity_type          TEXT,
    status               TEXT,
    onboarded_date       TEXT,
    tax_id               TEXT,
    annual_revenue_minor INTEGER,
    currency             TEXT NOT NULL CHECK (length(currency) = 3),
    industry             TEXT,
    payment_terms        TEXT,
    primary_contact_name TEXT,
    needs_review         INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
    review_notes         TEXT,
    import_run_id        INTEGER NOT NULL REFERENCES import_runs(id),
    UNIQUE (tenant_id, source_id)
  );

  CREATE TABLE IF NOT EXISTS tenant_accounts (
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code           TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT,
    sub_type       TEXT,
    normal_balance TEXT,
    is_active      INTEGER CHECK (is_active IN (0, 1)),
    description    TEXT,
    parent_code    TEXT,
    needs_review   INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
    review_notes   TEXT,
    import_run_id  INTEGER NOT NULL REFERENCES import_runs(id),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, parent_code) REFERENCES tenant_accounts(tenant_id, code) DEFERRABLE INITIALLY DEFERRED
  );

  CREATE TABLE IF NOT EXISTS tenant_contacts (
    tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id         TEXT NOT NULL,
    client_source_id  TEXT NOT NULL,
    first_name        TEXT,
    last_name         TEXT,
    email             TEXT,
    phone             TEXT,
    role              TEXT,
    is_active         INTEGER CHECK (is_active IN (0, 1)),
    preferred_channel TEXT,
    department        TEXT,
    needs_review      INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
    review_notes      TEXT,
    import_run_id     INTEGER NOT NULL REFERENCES import_runs(id),
    UNIQUE (tenant_id, source_id),
    FOREIGN KEY (tenant_id, client_source_id) REFERENCES tenant_clients(tenant_id, source_id)
  );

  CREATE TABLE IF NOT EXISTS tenant_transactions (
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id        TEXT NOT NULL,
    client_source_id TEXT NOT NULL,
    account_code     TEXT NOT NULL,
    date             TEXT NOT NULL,
    description      TEXT,
    entry_type       TEXT,
    amount_minor     INTEGER NOT NULL,
    currency         TEXT NOT NULL CHECK (length(currency) = 3),
    reference        TEXT,
    payment_method   TEXT,
    status           TEXT,
    category         TEXT,
    needs_review     INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
    review_notes     TEXT,
    import_run_id    INTEGER NOT NULL REFERENCES import_runs(id),
    UNIQUE (tenant_id, source_id),
    FOREIGN KEY (tenant_id, client_source_id) REFERENCES tenant_clients(tenant_id, source_id),
    FOREIGN KEY (tenant_id, account_code) REFERENCES tenant_accounts(tenant_id, code)
  );
`;

function seed(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM customers').get();
  if (count > 0) return;

  const customer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  const tenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, name, industry, region, contact_email, created_at)
    VALUES (@id, @name, @industry, @region, @contactEmail, @createdAt)
  `);
  const insertTenant = db.prepare(`
    INSERT INTO tenants (id, customer_id, status, plan, region, created_at, provisioned_at)
    VALUES (@id, @customerId, @status, @plan, @region, @createdAt, @provisionedAt)
  `);
  const insertState = db.prepare(
    'INSERT INTO onboarding_states (customer_id, progress_percent) VALUES (?, ?)'
  );
  const insertStep = db.prepare(`
    INSERT INTO onboarding_steps (customer_id, id, name, status, step_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertCustomer.run(customer);
    insertTenant.run(tenant);
    insertState.run(customer.id, 0);
    for (const step of createDefaultOnboardingSteps()) {
      insertStep.run(customer.id, step.id, step.name, step.status, step.order);
    }
  })();
}

/**
 * Rebuilds a tenants table created before provisioning existed, adding the UNIQUE and CHECK
 * constraints. Old rows can never have been provisioned, so they are kept as 'pending', and only
 * the earliest tenant per customer survives.
 */
function migrateTenants(db) {
  const columns = db.prepare('PRAGMA table_info(tenants)').all().map(c => c.name);
  if (columns.includes('provisioned_at')) return;

  db.transaction(() => {
    db.exec(tenantsTableSql('tenants_new'));
    db.exec(`
      INSERT INTO tenants_new (id, customer_id, status, plan, region, created_at, provisioned_at)
      SELECT id, customer_id, 'pending',
             CASE WHEN plan IN (${sqlList(TENANT_PLANS)}) THEN plan ELSE 'starter' END,
             NULL, created_at, NULL
      FROM tenants t
      WHERE id = (
        SELECT id FROM tenants WHERE customer_id = t.customer_id ORDER BY created_at, id LIMIT 1
      );
      DROP TABLE tenants;
      ALTER TABLE tenants_new RENAME TO tenants;
    `);
  })();
}

/**
 * Opens (creating if needed) the SQLite database, applies the schema and seeds example data
 * @param {string} [dbPath] - File path, or ':memory:' for an ephemeral database
 * @returns {import('better-sqlite3').Database}
 */
function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateTenants(db);
  seed(db);
  return db;
}

module.exports = { openDatabase, DEFAULT_DB_PATH };
