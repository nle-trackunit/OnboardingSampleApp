/**
 * Canonical target schema that every customer dialect is normalized into
 */

/**
 * @typedef {Object} TargetField
 * @property {string} key - Canonical field name
 * @property {string} column - Column in the tenant table
 * @property {'text'|'code'|'date'|'amount'|'boolean'|'picklist'|'personName'} type
 * @property {string} [table] - Translation table name, for picklists
 * @property {boolean} [required]
 * @property {boolean} [freeText] - A column whose values may contain unquoted commas
 * @property {'clients'|'accounts'} [references] - Must exist in the tenant (or, for accounts, in the same file)
 */

/** Order matters: an entity may only be imported after the entities it requires */
const ENTITIES = {
  clients: {
    label: 'Clients',
    table: 'tenant_clients',
    idKey: 'sourceId',
    requires: [],
    fields: [
      { key: 'sourceId', column: 'source_id', type: 'text', required: true },
      { key: 'name', column: 'name', type: 'text', required: true, freeText: true },
      { key: 'entityType', column: 'entity_type', type: 'picklist', table: 'entityType' },
      { key: 'status', column: 'status', type: 'picklist', table: 'clientStatus' },
      { key: 'onboardedDate', column: 'onboarded_date', type: 'date' },
      { key: 'taxId', column: 'tax_id', type: 'text' },
      { key: 'annualRevenue', column: 'annual_revenue_minor', type: 'amount' },
      { key: 'industry', column: 'industry', type: 'text' },
      { key: 'paymentTerms', column: 'payment_terms', type: 'picklist', table: 'paymentTerms' },
      { key: 'primaryContactName', column: 'primary_contact_name', type: 'personName', freeText: true }
    ]
  },
  accounts: {
    label: 'Chart of accounts',
    table: 'tenant_accounts',
    idKey: 'code',
    requires: [],
    fields: [
      { key: 'code', column: 'code', type: 'code', required: true },
      { key: 'name', column: 'name', type: 'text', required: true, freeText: true },
      { key: 'type', column: 'type', type: 'picklist', table: 'accountType' },
      { key: 'subType', column: 'sub_type', type: 'text' },
      { key: 'normalBalance', column: 'normal_balance', type: 'picklist', table: 'debitCredit' },
      { key: 'isActive', column: 'is_active', type: 'boolean' },
      { key: 'description', column: 'description', type: 'text', freeText: true },
      { key: 'parentCode', column: 'parent_code', type: 'code', references: 'accounts' }
    ]
  },
  contacts: {
    label: 'Contacts',
    table: 'tenant_contacts',
    idKey: 'sourceId',
    requires: ['clients'],
    fields: [
      { key: 'sourceId', column: 'source_id', type: 'text', required: true },
      { key: 'clientSourceId', column: 'client_source_id', type: 'text', required: true, references: 'clients' },
      { key: 'firstName', column: 'first_name', type: 'text' },
      { key: 'lastName', column: 'last_name', type: 'text' },
      { key: 'email', column: 'email', type: 'text' },
      { key: 'phone', column: 'phone', type: 'text' },
      { key: 'role', column: 'role', type: 'text', freeText: true },
      { key: 'isActive', column: 'is_active', type: 'picklist', table: 'contactActive' },
      { key: 'preferredChannel', column: 'preferred_channel', type: 'picklist', table: 'channel' },
      { key: 'department', column: 'department', type: 'text' }
    ]
  },
  transactions: {
    label: 'Transactions',
    table: 'tenant_transactions',
    idKey: 'sourceId',
    requires: ['clients', 'accounts'],
    fields: [
      { key: 'sourceId', column: 'source_id', type: 'text', required: true },
      { key: 'date', column: 'date', type: 'date', required: true },
      { key: 'clientSourceId', column: 'client_source_id', type: 'text', required: true, references: 'clients' },
      { key: 'accountCode', column: 'account_code', type: 'code', required: true, references: 'accounts' },
      { key: 'description', column: 'description', type: 'text', freeText: true },
      { key: 'entryType', column: 'entry_type', type: 'picklist', table: 'debitCredit' },
      { key: 'amount', column: 'amount_minor', type: 'amount', required: true },
      { key: 'reference', column: 'reference', type: 'text' },
      { key: 'paymentMethod', column: 'payment_method', type: 'picklist', table: 'paymentMethod' },
      { key: 'status', column: 'status', type: 'picklist', table: 'transactionStatus' },
      { key: 'category', column: 'category', type: 'text' }
    ]
  }
};

const ENTITY_NAMES = Object.keys(ENTITIES);

/** Entities whose rows carry a currency taken from the mapping */
const CURRENCY_ENTITIES = new Set(['clients', 'transactions']);

module.exports = { ENTITIES, ENTITY_NAMES, CURRENCY_ENTITIES };
