const { describe, it } = require('node:test');
const assert = require('node:assert');
const { 
  createCustomer, 
  createTenant, 
  createDefaultOnboardingSteps, 
  validateCustomerInfo,
  TARGET_FIELDS,
  validateDataMapping,
  calculateProgress 
} = require('./index');

describe('Domain Models', () => {
  describe('createCustomer', () => {
    it('should create a customer with provided data', () => {
      const customer = createCustomer({
        id: 'test_123',
        name: 'Test Corp',
        industry: 'Tech',
        region: 'EMEA'
      });

      assert.strictEqual(customer.id, 'test_123');
      assert.strictEqual(customer.name, 'Test Corp');
      assert.strictEqual(customer.industry, 'Tech');
      assert.strictEqual(customer.region, 'EMEA');
    });

    it('should generate default values for missing fields', () => {
      const customer = createCustomer({});

      assert.ok(customer.id.startsWith('cust_'));
      assert.strictEqual(customer.name, '');
      assert.ok(customer.createdAt);
    });
  });

  describe('validateCustomerInfo', () => {
    it('should accept valid input and normalize it', () => {
      const result = validateCustomerInfo({
        name: '  Test Corp ',
        industry: 'Tech',
        region: 'EMEA',
        contactEmail: ' Ops@Test.Example.com '
      });

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, {});
      assert.strictEqual(result.customer.name, 'Test Corp');
      assert.strictEqual(result.customer.contactEmail, 'ops@test.example.com');
    });

    it('should report every missing field', () => {
      const result = validateCustomerInfo({});

      assert.strictEqual(result.valid, false);
      assert.deepStrictEqual(
        Object.keys(result.errors).sort(),
        ['contactEmail', 'industry', 'name', 'region']
      );
    });

    it('should reject an invalid email', () => {
      const result = validateCustomerInfo({
        name: 'Test Corp',
        industry: 'Tech',
        region: 'EMEA',
        contactEmail: 'not-an-email'
      });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.contactEmail, 'Contact email is invalid');
    });
  });

  describe('validateDataMapping', () => {
    const sourceHeaders = ['clientCode', 'companyName', 'clientStatus'];

    it('should accept a mapping of every required field and trim values', () => {
      const result = validateDataMapping('clients', {
        sourceHeaders,
        columns: { clientId: ' clientCode ', name: 'companyName', status: 'clientStatus', taxId: '' }
      });

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.mapping.columns, {
        clientId: 'clientCode',
        name: 'companyName',
        status: 'clientStatus'
      });
    });

    it('should require the required target fields to be mapped', () => {
      const result = validateDataMapping('clients', { sourceHeaders, columns: {} });

      assert.strictEqual(result.valid, false);
      assert.deepStrictEqual(Object.keys(result.errors).sort(), ['clientId', 'name']);
    });

    it('should reject columns that are not in the file or mapped twice', () => {
      const result = validateDataMapping('clients', {
        sourceHeaders,
        columns: { clientId: 'clientCode', name: 'clientCode', status: 'missing' }
      });

      assert.strictEqual(result.valid, false);
      assert.match(result.errors.name, /already mapped to Client ID/);
      assert.match(result.errors.status, /not in the file/);
    });

    it('should reject an unknown entity or missing headers', () => {
      assert.ok(validateDataMapping('widgets', {}).errors.entity);
      assert.ok(validateDataMapping('clients', { columns: {} }).errors.sourceHeaders);
    });

    it('should list an alias for every sample-data client column', () => {
      const aliases = TARGET_FIELDS.clients.flatMap(f => f.aliases);
      for (const header of ['Client ID', 'clientCode', 'customer_id', 'Primary Contact', 'key_contact_name']) {
        assert.ok(aliases.includes(header), header);
      }
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for empty steps', () => {
      assert.strictEqual(calculateProgress([]), 0);
      assert.strictEqual(calculateProgress(null), 0);
    });

    it('should calculate correct percentage', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'pending' },
        { status: 'pending' }
      ];
      assert.strictEqual(calculateProgress(steps), 50);
    });

    it('should return 100 when all steps completed', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' }
      ];
      assert.strictEqual(calculateProgress(steps), 100);
    });
  });

  describe('createDefaultOnboardingSteps', () => {
    it('should create 4 default steps', () => {
      const steps = createDefaultOnboardingSteps();
      
      assert.strictEqual(steps.length, 4);
      assert.strictEqual(steps[0].name, 'Customer Info');
      assert.strictEqual(steps[3].name, 'Import');
    });

    it('should set all steps to pending status', () => {
      const steps = createDefaultOnboardingSteps();
      
      steps.forEach(step => {
        assert.strictEqual(step.status, 'pending');
      });
    });
  });
});
