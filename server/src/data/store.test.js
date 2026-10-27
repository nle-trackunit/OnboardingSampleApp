const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
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
