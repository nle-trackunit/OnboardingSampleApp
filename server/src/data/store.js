/**
 * SQLite-backed Data Store
 */

const { createTenant, resolveCanonicalFields, calculateProgress } = require('../models');
const { ENTITIES, ENTITY_NAMES, CURRENCY_ENTITIES } = require('../import/schema');

function toImportRun(row) {
  return row && {
    id: row.id,
    tenantId: row.tenant_id,
    entity: row.entity,
    filename: row.filename,
    mappingId: row.mapping_id,
    contentHash: row.content_hash,
    rowsRead: row.rows_read,
    rowsValid: row.rows_valid,
    rowsRejected: row.rows_rejected,
    rowsFlagged: row.rows_flagged,
    committedAt: row.committed_at
  };
}

function upsertSql(entity) {
  const { table, idKey, fields } = ENTITIES[entity];
  const columns = [
    ...fields.map(f => f.column),
    ...(CURRENCY_ENTITIES.has(entity) ? ['currency'] : []),
    'needs_review', 'review_notes', 'import_run_id'
  ];
  const idColumn = fields.find(f => f.key === idKey).column;
  return `
    INSERT INTO ${table} (tenant_id, ${columns.join(', ')})
    VALUES (@tenantId, ${columns.map(c => `@${c}`).join(', ')})
    ON CONFLICT (tenant_id, ${idColumn}) DO UPDATE SET
      ${columns.filter(c => c !== idColumn).map(c => `${c} = excluded.${c}`).join(',\n      ')}
  `;
}

function toRowParams(entity, tenantId, importRunId, { record, review }) {
  const params = { tenantId, import_run_id: importRunId };
  for (const field of ENTITIES[entity].fields) {
    const value = record[field.key];
    params[field.column] = typeof value === 'boolean' ? Number(value) : value;
  }
  if (CURRENCY_ENTITIES.has(entity)) params.currency = record.currency;
  params.needs_review = review.length > 0 ? 1 : 0;
  params.review_notes = review.length > 0 ? JSON.stringify(review) : null;
  return params;
}

function toCustomer(row) {
  return row && {
    id: row.id,
    name: row.name,
    industry: row.industry,
    region: row.region,
    contactEmail: row.contact_email,
    createdAt: row.created_at
  };
}

function toTenant(row) {
  return row && {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    plan: row.plan,
    region: row.region,
    createdAt: row.created_at,
    provisionedAt: row.provisioned_at
  };
}

function toStep(row) {
  return { id: row.id, name: row.name, status: row.status, order: row.step_order };
}

function toDataMapping(row) {
  return row && {
    customerId: row.customer_id,
    entity: row.entity,
    sourceHeaders: JSON.parse(row.source_headers),
    columns: JSON.parse(row.columns),
    updatedAt: row.updated_at
  };
}

/**
 * Creates a store bound to an open database
 * @param {import('better-sqlite3').Database} db
 */
function createStore(db) {
  const stmts = {
    allCustomers: db.prepare('SELECT * FROM customers ORDER BY created_at, id'),
    customerById: db.prepare('SELECT * FROM customers WHERE id = ?'),
    insertCustomer: db.prepare(`
      INSERT INTO customers (id, name, industry, region, contact_email, created_at)
      VALUES (@id, @name, @industry, @region, @contactEmail, @createdAt)
    `),
    allTenants: db.prepare('SELECT * FROM tenants ORDER BY created_at, id'),
    tenantByCustomerId: db.prepare('SELECT * FROM tenants WHERE customer_id = ?'),
    insertTenant: db.prepare(`
      INSERT INTO tenants (id, customer_id, status, plan, region, created_at, provisioned_at)
      VALUES (@id, @customerId, @status, @plan, @region, @createdAt, @provisionedAt)
    `),
    activateTenant: db.prepare(`
      UPDATE tenants SET status = 'active', plan = @plan, region = @region, provisioned_at = @provisionedAt
      WHERE customer_id = @customerId AND status = 'pending'
    `),
    stateByCustomerId: db.prepare('SELECT * FROM onboarding_states WHERE customer_id = ?'),
    allStates: db.prepare(`
      SELECT s.* FROM onboarding_states s
      JOIN customers c ON c.id = s.customer_id
      ORDER BY c.created_at, c.id
    `),
    insertState: db.prepare('INSERT INTO onboarding_states (customer_id, progress_percent) VALUES (?, ?)'),
    updateProgress: db.prepare('UPDATE onboarding_states SET progress_percent = ? WHERE customer_id = ?'),
    stepsByCustomerId: db.prepare('SELECT * FROM onboarding_steps WHERE customer_id = ? ORDER BY step_order'),
    deleteSteps: db.prepare('DELETE FROM onboarding_steps WHERE customer_id = ?'),
    insertStep: db.prepare(`
      INSERT INTO onboarding_steps (customer_id, id, name, status, step_order)
      VALUES (?, ?, ?, ?, ?)
    `),
    mappingsByCustomerId: db.prepare('SELECT * FROM data_mappings WHERE customer_id = ? ORDER BY entity'),
    mappingByCustomerAndEntity: db.prepare('SELECT * FROM data_mappings WHERE customer_id = ? AND entity = ?'),
    upsertMapping: db.prepare(`
      INSERT INTO data_mappings (customer_id, entity, source_headers, columns, updated_at)
      VALUES (@customerId, @entity, @sourceHeaders, @columns, @updatedAt)
      ON CONFLICT (customer_id, entity) DO UPDATE SET
        source_headers = excluded.source_headers,
        columns = excluded.columns,
        updated_at = excluded.updated_at
    `),
    importRunsByTenant: db.prepare('SELECT * FROM import_runs WHERE tenant_id = ? ORDER BY id'),
    latestImportRun: db.prepare('SELECT * FROM import_runs WHERE tenant_id = ? AND entity = ? ORDER BY id DESC LIMIT 1'),
    insertImportRun: db.prepare(`
      INSERT INTO import_runs (tenant_id, entity, filename, mapping_id, content_hash,
        rows_read, rows_valid, rows_rejected, rows_flagged, committed_at)
      VALUES (@tenantId, @entity, @filename, @mappingId, @contentHash,
        @rowsRead, @rowsValid, @rowsRejected, @rowsFlagged, @committedAt)
    `),
    importRunById: db.prepare('SELECT * FROM import_runs WHERE id = ?'),
    hasClient: db.prepare('SELECT 1 FROM tenant_clients WHERE tenant_id = ? AND source_id = ?'),
    hasAccount: db.prepare('SELECT 1 FROM tenant_accounts WHERE tenant_id = ? AND code = ?'),
    upsertRow: Object.fromEntries(ENTITY_NAMES.map(entity => [entity, db.prepare(upsertSql(entity))])),
    countRows: Object.fromEntries(ENTITY_NAMES.map(entity => [
      entity, db.prepare(`SELECT COUNT(*) AS count FROM ${ENTITIES[entity].table} WHERE tenant_id = ?`)
    ]))
  };

  function insertSteps(customerId, steps = []) {
    for (const step of steps) {
      stmts.insertStep.run(customerId, step.id, step.name, step.status, step.order);
    }
  }

  function toState(row) {
    return row && {
      customerId: row.customer_id,
      steps: stmts.stepsByCustomerId.all(row.customer_id).map(toStep),
      progressPercent: row.progress_percent
    };
  }

  function getCustomers() {
    return stmts.allCustomers.all().map(toCustomer);
  }

  function getCustomerById(id) {
    return toCustomer(stmts.customerById.get(id));
  }

  function addCustomer(customer) {
    stmts.insertCustomer.run(customer);
    return customer;
  }

  function getTenants() {
    return stmts.allTenants.all().map(toTenant);
  }

  function getTenantByCustomerId(customerId) {
    return toTenant(stmts.tenantByCustomerId.get(customerId));
  }

  function addTenant(tenant) {
    stmts.insertTenant.run(tenant);
    return tenant;
  }

  function getOnboardingState(customerId) {
    return toState(stmts.stateByCustomerId.get(customerId));
  }

  function getAllOnboardingStates() {
    return stmts.allStates.all().map(toState);
  }

  const addOnboardingState = db.transaction((state) => {
    stmts.insertState.run(state.customerId, state.progressPercent ?? 0);
    insertSteps(state.customerId, state.steps);
    return getOnboardingState(state.customerId);
  });

  const updateOnboardingState = db.transaction((customerId, updates) => {
    if (!stmts.stateByCustomerId.get(customerId)) return null;

    if (updates.steps) {
      stmts.deleteSteps.run(customerId);
      insertSteps(customerId, updates.steps);
    }
    if (updates.progressPercent !== undefined) {
      stmts.updateProgress.run(updates.progressPercent, customerId);
    }
    return getOnboardingState(customerId);
  });

  /**
   * Provisions a customer's tenant and completes the Tenant Setup step, all or nothing.
   * A missing tenant row and a 'pending' one are both "not provisioned".
   * @returns {{ outcome: 'provisioned'|'already_provisioned', tenant: object }
   *   | { outcome: 'customer_not_found' }
   *   | { outcome: 'unmapped', field: 'region'|'industry' }}
   */
  const provisionTransaction = db.transaction((customerId, plan) => {
    const customer = getCustomerById(customerId);
    if (!customer) return { outcome: 'customer_not_found' };

    const existing = getTenantByCustomerId(customerId);
    if (existing?.status === 'active') return { outcome: 'already_provisioned', tenant: existing };

    const { region, unmappedField } = resolveCanonicalFields(customer);
    if (unmappedField) return { outcome: 'unmapped', field: unmappedField };

    const provisionedAt = new Date().toISOString();
    if (existing) {
      stmts.activateTenant.run({ customerId, plan, region, provisionedAt });
    } else {
      addTenant(createTenant({ customerId, status: 'active', plan, region, provisionedAt }));
    }

    const state = getOnboardingState(customerId);
    if (!state) throw new Error(`No onboarding state for customer ${customerId}`);
    const steps = state.steps.map(step =>
      step.id === 'step_3' ? { ...step, status: 'completed' } : step
    );
    updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });

    return { outcome: 'provisioned', tenant: getTenantByCustomerId(customerId) };
  });

  function provisionTenant(customerId, plan) {
    try {
      return provisionTransaction.immediate(customerId, plan);
    } catch (err) {
      // Another connection provisioned the same customer first; theirs is the one tenant
      const winner = err.code === 'SQLITE_CONSTRAINT_UNIQUE' && getTenantByCustomerId(customerId);
      if (winner?.status === 'active') return { outcome: 'already_provisioned', tenant: winner };
      throw err;
    }
  }

  /**
   * Latest committed import run and current row count for each entity in a tenant
   * @returns {Object<string, { run: object|null, rowCount: number }>}
   */
  function getImportState(tenantId) {
    const runs = stmts.importRunsByTenant.all(tenantId).map(toImportRun);
    return Object.fromEntries(ENTITY_NAMES.map(entity => [entity, {
      run: runs.filter(r => r.entity === entity).pop() || null,
      rowCount: stmts.countRows[entity].get(tenantId).count
    }]));
  }

  function importLookups(tenantId) {
    return {
      hasClient: (sourceId) => Boolean(stmts.hasClient.get(tenantId, sourceId)),
      hasAccount: (code) => Boolean(stmts.hasAccount.get(tenantId, code))
    };
  }

  /**
   * Writes a prepared file's valid rows into a tenant in one transaction, records the run, and
   * completes the Import step once every entity has been imported. Committing the same file as
   * the entity's latest run is a no-op that returns that run.
   * @returns {{ outcome: 'committed'|'duplicate', run: object }}
   */
  const commitImport = db.transaction(({ customerId, tenantId, entity, filename, contentHash, prepared }) => {
    const latest = toImportRun(stmts.latestImportRun.get(tenantId, entity));
    if (latest?.contentHash === contentHash) return { outcome: 'duplicate', run: latest };

    const { lastInsertRowid } = stmts.insertImportRun.run({
      tenantId,
      entity,
      filename,
      mappingId: prepared.mapping.id,
      contentHash,
      rowsRead: prepared.rowsRead,
      rowsValid: prepared.rowsValid,
      rowsRejected: prepared.rowsRejected,
      rowsFlagged: prepared.rowsFlagged,
      committedAt: new Date().toISOString()
    });
    for (const row of prepared.rows) {
      stmts.upsertRow[entity].run(toRowParams(entity, tenantId, lastInsertRowid, row));
    }

    const state = getOnboardingState(customerId);
    const allImported = ENTITY_NAMES.every(e => stmts.latestImportRun.get(tenantId, e));
    if (state && allImported) {
      const steps = state.steps.map(step =>
        step.id === 'step_4' ? { ...step, status: 'completed' } : step
      );
      updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
    }

    return { outcome: 'committed', run: toImportRun(stmts.importRunById.get(lastInsertRowid)) };
  });

  function getDataMappings(customerId) {
    return stmts.mappingsByCustomerId.all(customerId).map(toDataMapping);
  }

  function getDataMapping(customerId, entity) {
    return toDataMapping(stmts.mappingByCustomerAndEntity.get(customerId, entity));
  }

  function saveDataMapping(mapping) {
    stmts.upsertMapping.run({
      customerId: mapping.customerId,
      entity: mapping.entity,
      sourceHeaders: JSON.stringify(mapping.sourceHeaders),
      columns: JSON.stringify(mapping.columns),
      updatedAt: mapping.updatedAt || new Date().toISOString()
    });
    return getDataMapping(mapping.customerId, mapping.entity);
  }

  return {
    transaction: (fn) => db.transaction(fn)(),
    getCustomers,
    getCustomerById,
    addCustomer,
    getTenants,
    getTenantByCustomerId,
    addTenant,
    provisionTenant,
    getImportState,
    importLookups,
    commitImport: (input) => commitImport.immediate(input),
    getOnboardingState,
    getAllOnboardingStates,
    addOnboardingState,
    updateOnboardingState,
    getDataMappings,
    getDataMapping,
    saveDataMapping
  };
}

module.exports = { createStore };
