const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { openDatabase } = require('./data/db');
const { createStore } = require('./data/store');
const { prepareImport } = require('./import/pipeline');
const { ENTITIES, ENTITY_NAMES } = require('./import/schema');
const {
  createCustomer,
  createDefaultOnboardingSteps,
  validateCustomerInfo,
  TARGET_FIELDS,
  validateDataMapping,
  validateProvisionRequest,
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

// Get all tenants (Tenant Setup view)
app.get('/api/tenants', (req, res) => {
  res.json(store.getTenants());
});

// Provision a customer's tenant and complete the Tenant Setup step
app.post('/api/tenants/:customerId', (req, res) => {
  const { valid, errors, plan } = validateProvisionRequest(req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }

  let result;
  try {
    result = store.provisionTenant(req.params.customerId, plan);
  } catch (err) {
    console.error('Provisioning failed:', err);
    return res.status(500).json({
      error: 'Provisioning did not complete. Nothing was changed, so you can try again.'
    });
  }

  switch (result.outcome) {
    case 'customer_not_found':
      return res.status(404).json({ error: 'That customer no longer exists' });
    case 'unmapped':
      return res.status(422).json({
        error: `Resolve ${result.field} on the customer before provisioning`,
        field: result.field
      });
    case 'already_provisioned':
      return res.status(200).json(result.tenant);
    default:
      return res.status(201).json(result.tenant);
  }
});

const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'], limit: '5mb' });

/**
 * Resolves the customer's provisioned tenant and runs the import pipeline on the uploaded file,
 * or sends the error response and returns null
 */
function prepareUpload(req, res) {
  const { id, entity } = req.params;
  if (!ENTITIES[entity]) {
    res.status(404).json({ error: `Unknown entity type: ${entity}` });
    return null;
  }
  if (!store.getCustomerById(id)) {
    res.status(404).json({ error: 'That customer no longer exists' });
    return null;
  }
  const tenant = store.getTenantByCustomerId(id);
  if (tenant?.status !== 'active') {
    res.status(409).json({ error: 'Provision a tenant before importing', code: 'not_provisioned' });
    return null;
  }

  const state = store.getImportState(tenant.id);
  const missing = ENTITIES[entity].requires.filter(e => !state[e].run);
  if (missing.length > 0) {
    res.status(409).json({
      error: `Import ${missing.map(e => ENTITIES[e].label.toLowerCase()).join(' and ')} first`,
      code: 'import_order'
    });
    return null;
  }

  const text = typeof req.body === 'string' ? req.body : '';
  const prepared = prepareImport({ entity, text, lookups: store.importLookups(tenant.id) });
  if (prepared.error === 'unreadable') {
    res.status(400).json({ error: "That file couldn't be read as CSV", code: 'unreadable' });
    return null;
  }
  if (prepared.error === 'wrong_entity') {
    res.status(422).json({
      error: `This looks like a ${ENTITIES[prepared.detectedEntity].label.toLowerCase()} file — you selected ${ENTITIES[entity].label}`,
      code: 'wrong_entity',
      detectedEntity: prepared.detectedEntity
    });
    return null;
  }
  if (prepared.error === 'unrecognized') {
    res.status(422).json({
      error: 'Unrecognized file format',
      code: 'unrecognized',
      unmatchedHeaders: prepared.unmatchedHeaders,
      missingHeaders: prepared.missingHeaders
    });
    return null;
  }

  return { tenant, entity, text, prepared, filename: String(req.query.filename || `${entity}.csv`) };
}

const toPreview = ({ rows, ...summary }) => summary;

// Import state of each entity type for a customer's tenant
app.get('/api/customers/:id/imports', (req, res) => {
  if (!store.getCustomerById(req.params.id)) {
    return res.status(404).json({ error: 'That customer no longer exists' });
  }
  const tenant = store.getTenantByCustomerId(req.params.id);
  const provisioned = tenant?.status === 'active';
  const state = provisioned ? store.getImportState(tenant.id) : {};
  res.json({
    provisioned,
    entities: ENTITY_NAMES.map(entity => ({
      entity,
      label: ENTITIES[entity].label,
      requires: ENTITIES[entity].requires,
      run: state[entity]?.run || null,
      rowCount: state[entity]?.rowCount || 0
    }))
  });
});

// Read and validate an uploaded CSV without writing anything
app.post('/api/customers/:id/imports/:entity/preview', csvBody, (req, res) => {
  const upload = prepareUpload(req, res);
  if (upload) res.json(toPreview(upload.prepared));
});

// Commit an uploaded CSV's valid rows into the tenant
app.post('/api/customers/:id/imports/:entity', csvBody, (req, res) => {
  const upload = prepareUpload(req, res);
  if (!upload) return;
  const { tenant, entity, text, prepared, filename } = upload;

  if (prepared.rowsValid === 0) {
    return res.status(200).json({ outcome: 'nothing_to_import', run: null, ...toPreview(prepared) });
  }

  let result;
  try {
    result = store.commitImport({
      customerId: req.params.id,
      tenantId: tenant.id,
      entity,
      filename,
      contentHash: crypto.createHash('sha256').update(text).digest('hex'),
      prepared
    });
  } catch (err) {
    console.error('Import commit failed:', err);
    return res.status(500).json({
      error: 'The import did not complete. Nothing was written, so you can upload the file again.'
    });
  }

  res.status(result.outcome === 'committed' ? 201 : 200).json({ ...result, ...toPreview(prepared) });
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
