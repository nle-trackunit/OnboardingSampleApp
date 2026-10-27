const express = require('express');
const cors = require('cors');
const { openDatabase } = require('./data/db');
const { createStore } = require('./data/store');
const {
  createCustomer,
  createDefaultOnboardingSteps,
  validateCustomerInfo,
  TARGET_FIELDS,
  validateDataMapping,
  calculateProgress
} = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;
const store = createStore(openDatabase());

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Create customer from the Customer Info form and add it to the onboarding queue
app.post('/api/customers', (req, res) => {
  const { valid, errors, customer: info } = validateCustomerInfo(req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }

  const steps = createDefaultOnboardingSteps().map(step =>
    step.id === 'step_1' ? { ...step, status: 'completed' } : step
  );
  const customer = store.transaction(() => {
    const created = store.addCustomer(createCustomer(info));
    store.addOnboardingState({
      customerId: created.id,
      steps,
      progressPercent: calculateProgress(steps)
    });
    return created;
  });

  res.status(201).json(customer);
});

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Get the platform fields that customer data can be mapped to
app.get('/api/mapping/fields', (req, res) => {
  res.json(TARGET_FIELDS);
});

// Get all saved data mappings for a customer
app.get('/api/customers/:id/mappings', (req, res) => {
  if (!store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(store.getDataMappings(req.params.id));
});

// Save a customer's column mapping for one entity and complete the Data Mapping step
app.put('/api/customers/:id/mappings/:entity', (req, res) => {
  const { id, entity } = req.params;
  if (!store.getCustomerById(id)) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { valid, errors, mapping } = validateDataMapping(entity, req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }

  const saved = store.transaction(() => {
    const result = store.saveDataMapping({ customerId: id, entity, ...mapping });
    const state = store.getOnboardingState(id);
    if (state) {
      const steps = state.steps.map(step =>
        step.id === 'step_2' ? { ...step, status: 'completed' } : step
      );
      store.updateOnboardingState(id, { steps, progressPercent: calculateProgress(steps) });
    }
    return result;
  });

  res.json(saved);
});

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();
  
  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || ''
    };
  });
  
  res.json(dashboard);
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
