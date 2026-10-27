/**
 * SQLite-backed Data Store
 */

const { createTenant, resolveCanonicalFields, calculateProgress } = require('../models');

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
    `)
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
