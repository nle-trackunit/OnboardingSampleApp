/**
 * SQLite-backed Data Store
 */

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
    createdAt: row.created_at
  };
}

function toStep(row) {
  return { id: row.id, name: row.name, status: row.status, order: row.step_order };
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
    tenantByCustomerId: db.prepare('SELECT * FROM tenants WHERE customer_id = ? ORDER BY created_at LIMIT 1'),
    insertTenant: db.prepare(`
      INSERT INTO tenants (id, customer_id, status, plan, created_at)
      VALUES (@id, @customerId, @status, @plan, @createdAt)
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

  return {
    transaction: (fn) => db.transaction(fn)(),
    getCustomers,
    getCustomerById,
    addCustomer,
    getTenants,
    getTenantByCustomerId,
    addTenant,
    getOnboardingState,
    getAllOnboardingStates,
    addOnboardingState,
    updateOnboardingState
  };
}

module.exports = { createStore };
