/**
 * SQLite database connection, schema and seed data
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createCustomer, createTenant, createDefaultOnboardingSteps } = require('../models');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'onboarding.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS customers (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    industry      TEXT NOT NULL DEFAULT '',
    region        TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    plan        TEXT NOT NULL DEFAULT 'starter',
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tenants_customer_id ON tenants(customer_id);

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
    INSERT INTO tenants (id, customer_id, status, plan, created_at)
    VALUES (@id, @customerId, @status, @plan, @createdAt)
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
  seed(db);
  return db;
}

module.exports = { openDatabase, DEFAULT_DB_PATH };
