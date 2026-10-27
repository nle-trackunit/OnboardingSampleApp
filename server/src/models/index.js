/**
 * Domain Models for Customer Onboarding
 */

/**
 * @typedef {Object} Customer
 * @property {string} id - Unique customer identifier
 * @property {string} name - Customer/company name
 * @property {string} industry - Industry vertical
 * @property {string} region - Geographic region
 * @property {string} contactEmail - Primary contact email
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} Tenant
 * @property {string} id - Unique tenant identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} status - 'pending' | 'active'
 * @property {string} plan - 'starter' | 'professional' | 'enterprise'
 * @property {string|null} region - Canonical region the tenant was provisioned in
 * @property {string} createdAt - ISO timestamp
 * @property {string|null} provisionedAt - ISO timestamp, null until provisioned
 */

/**
 * @typedef {Object} OnboardingStep
 * @property {string} id - Step identifier
 * @property {string} name - Human-readable step name
 * @property {string} status - 'pending' | 'in_progress' | 'completed' | 'failed'
 * @property {number} order - Step sequence number
 */

/**
 * @typedef {Object} OnboardingState
 * @property {string} customerId - Associated customer ID
 * @property {OnboardingStep[]} steps - Array of onboarding steps
 * @property {number} progressPercent - Overall progress (0-100)
 */

/**
 * Creates a new Customer object
 * @param {Partial<Customer>} data 
 * @returns {Customer}
 */
function createCustomer(data) {
  return {
    id: data.id || `cust_${Date.now()}`,
    name: data.name || '',
    industry: data.industry || '',
    region: data.region || '',
    contactEmail: data.contactEmail || '',
    createdAt: data.createdAt || new Date().toISOString()
  };
}

/**
 * Creates a new Tenant object
 * @param {Partial<Tenant>} data 
 * @returns {Tenant}
 */
function createTenant(data) {
  return {
    id: data.id || `tenant_${Date.now()}`,
    customerId: data.customerId || '',
    status: data.status || 'pending',
    plan: data.plan || 'starter',
    region: data.region || null,
    createdAt: data.createdAt || new Date().toISOString(),
    provisionedAt: data.provisionedAt || null
  };
}

const TENANT_STATUSES = ['pending', 'active'];
const TENANT_PLANS = ['starter', 'professional', 'enterprise'];

const REGIONS = ['North America', 'EMEA', 'APAC', 'LATAM'];
const INDUSTRIES = [
  'Accounting',
  'Financial Services',
  'Legal',
  'Manufacturing',
  'Technology',
  'Healthcare',
  'Retail',
  'Public Sector',
  'Other'
];

function toCanonical(value, vocabulary) {
  const key = String(value ?? '').trim().toLowerCase();
  return vocabulary.find(v => v.toLowerCase() === key) || null;
}

/**
 * Resolves a customer's region and industry against the canonical vocabularies
 * @param {Customer} customer
 * @returns {{ region: string|null, industry: string|null, unmappedField: 'region'|'industry'|null }}
 */
function resolveCanonicalFields(customer) {
  const region = toCanonical(customer.region, REGIONS);
  const industry = toCanonical(customer.industry, INDUSTRIES);
  const unmappedField = !region ? 'region' : !industry ? 'industry' : null;
  return { region, industry, unmappedField };
}

/**
 * Validates a provisioning request body
 * @param {{ plan?: string }} data
 * @returns {{ valid: boolean, errors: Object<string, string>, plan: string }}
 */
function validateProvisionRequest(data = {}) {
  const plan = String(data.plan ?? '').trim().toLowerCase();
  const errors = {};
  if (!plan) {
    errors.plan = 'Plan is required';
  } else if (!TENANT_PLANS.includes(plan)) {
    errors.plan = `Plan must be one of: ${TENANT_PLANS.join(', ')}`;
  }
  return { valid: Object.keys(errors).length === 0, errors, plan };
}

/**
 * Creates default onboarding steps
 * @returns {OnboardingStep[]}
 */
function createDefaultOnboardingSteps() {
  return [
    { id: 'step_1', name: 'Customer Info', status: 'pending', order: 1 },
    { id: 'step_2', name: 'Data Mapping', status: 'pending', order: 2 },
    { id: 'step_3', name: 'Tenant Setup', status: 'pending', order: 3 },
    { id: 'step_4', name: 'Import', status: 'pending', order: 4 }
  ];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates and normalizes customer info input
 * @param {Partial<Customer>} data
 * @returns {{ valid: boolean, errors: Object<string, string>, customer: Partial<Customer> }}
 */
function validateCustomerInfo(data = {}) {
  const customer = {
    name: String(data.name ?? '').trim(),
    industry: String(data.industry ?? '').trim(),
    region: String(data.region ?? '').trim(),
    contactEmail: String(data.contactEmail ?? '').trim().toLowerCase()
  };

  const errors = {};
  if (!customer.name) errors.name = 'Name is required';
  if (!customer.industry) errors.industry = 'Industry is required';
  if (!customer.region) errors.region = 'Region is required';
  if (!customer.contactEmail) {
    errors.contactEmail = 'Contact email is required';
  } else if (!EMAIL_PATTERN.test(customer.contactEmail)) {
    errors.contactEmail = 'Contact email is invalid';
  }

  return { valid: Object.keys(errors).length === 0, errors, customer };
}

/**
 * @typedef {Object} TargetField
 * @property {string} key - Platform field name
 * @property {string} label - Human-readable field name
 * @property {boolean} required - Whether every mapping must provide this field
 * @property {string[]} aliases - Known customer column names for this field
 */

/**
 * @typedef {Object} DataMapping
 * @property {string} customerId - Associated customer ID
 * @property {string} entity - Mapped entity, e.g. 'clients'
 * @property {string[]} sourceHeaders - Column headers of the customer's file
 * @property {Object<string, string>} columns - Target field key -> source header
 * @property {string} updatedAt - ISO timestamp
 */

/** @type {Object<string, TargetField[]>} */
const TARGET_FIELDS = {
  clients: [
    { key: 'clientId', label: 'Client ID', required: true, aliases: ['Client ID', 'clientCode', 'customer_id'] },
    { key: 'name', label: 'Name', required: true, aliases: ['Client Name', 'companyName', 'business_name'] },
    { key: 'entityType', label: 'Entity Type', required: false, aliases: ['Business Type', 'entityType', 'legal_structure'] },
    { key: 'status', label: 'Status', required: false, aliases: ['Status', 'clientStatus', 'account_status'] },
    { key: 'startDate', label: 'Start Date', required: false, aliases: ['Date Onboarded', 'startDate', 'registration_date'] },
    { key: 'taxId', label: 'Tax ID', required: false, aliases: ['Tax ID', 'federalTaxId', 'tax_reference'] },
    { key: 'revenue', label: 'Revenue', required: false, aliases: ['Annual Revenue', 'yearlyRevenue', 'gross_revenue'] },
    { key: 'industry', label: 'Industry', required: false, aliases: ['Industry', 'sectorCode', 'industry_sector'] },
    { key: 'paymentTerms', label: 'Payment Terms', required: false, aliases: ['Payment Terms', 'billingTerms', 'credit_terms'] },
    { key: 'primaryContact', label: 'Primary Contact', required: false, aliases: ['Primary Contact', 'mainContact', 'key_contact_name'] }
  ]
};

/**
 * Validates a column mapping against the target fields of an entity
 * @param {string} entity
 * @param {{ sourceHeaders?: string[], columns?: Object<string, string> }} data
 * @returns {{ valid: boolean, errors: Object<string, string>, mapping: { sourceHeaders: string[], columns: Object<string, string> } }}
 */
function validateDataMapping(entity, data = {}) {
  const fields = TARGET_FIELDS[entity];
  if (!fields) {
    return { valid: false, errors: { entity: `Unknown entity: ${entity}` }, mapping: null };
  }

  const sourceHeaders = Array.isArray(data.sourceHeaders)
    ? data.sourceHeaders.map(h => String(h).trim()).filter(Boolean)
    : [];
  const errors = {};
  if (sourceHeaders.length === 0) errors.sourceHeaders = 'Source headers are required';

  const columns = {};
  const usedBy = {};
  for (const field of fields) {
    const source = String(data.columns?.[field.key] ?? '').trim();
    if (!source) {
      if (field.required) errors[field.key] = `${field.label} must be mapped`;
      continue;
    }
    if (sourceHeaders.length > 0 && !sourceHeaders.includes(source)) {
      errors[field.key] = `Column "${source}" is not in the file`;
    } else if (usedBy[source]) {
      errors[field.key] = `Column "${source}" is already mapped to ${usedBy[source]}`;
    } else {
      usedBy[source] = field.label;
    }
    columns[field.key] = source;
  }

  return { valid: Object.keys(errors).length === 0, errors, mapping: { sourceHeaders, columns } };
}

/**
 * Calculates progress percentage from steps
 * @param {OnboardingStep[]} steps 
 * @returns {number}
 */
function calculateProgress(steps) {
  if (!steps || steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100);
}

module.exports = {
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  validateCustomerInfo,
  TARGET_FIELDS,
  validateDataMapping,
  calculateProgress,
  resolveCanonicalFields,
  validateProvisionRequest,
  TENANT_STATUSES,
  TENANT_PLANS,
  REGIONS,
  INDUSTRIES
};
