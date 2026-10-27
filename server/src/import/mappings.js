/**
 * Known customer file dialects (sample-data/README.md).
 *
 * Each mapping is data: a column map per entity (whose header set is the file signature), the
 * date order, the currency, how person names are written, and value translation tables. Import
 * applies a mapping and never defines one, so a new dialect is a new entry here, not a change to
 * the pipeline.
 */

const BOOLEAN_ACTIVE_ONLY = { active: true, inactive: false, pending: false };

const MAPPINGS = [
  {
    id: 'abc-accounting',
    label: 'ABC Accounting (Title Case, MM/DD/YYYY, USD)',
    dateOrder: 'MDY',
    currency: 'USD',
    personNameOrder: 'first_last',
    entities: {
      clients: {
        sourceId: 'Client ID', name: 'Client Name', entityType: 'Business Type', status: 'Status',
        onboardedDate: 'Date Onboarded', taxId: 'Tax ID', annualRevenue: 'Annual Revenue', industry: 'Industry',
        paymentTerms: 'Payment Terms', primaryContactName: 'Primary Contact'
      },
      contacts: {
        sourceId: 'Contact ID', clientSourceId: 'Client ID', firstName: 'First Name', lastName: 'Last Name',
        email: 'Email', phone: 'Phone', role: 'Role', isActive: 'Status',
        preferredChannel: 'Preferred Contact Method', department: 'Department'
      },
      accounts: {
        code: 'Account Number', name: 'Account Name', type: 'Account Type', subType: 'Sub Type',
        normalBalance: 'Normal Balance', isActive: 'Status', description: 'Description', parentCode: 'Parent Account'
      },
      transactions: {
        sourceId: 'Transaction ID', date: 'Date', clientSourceId: 'Client ID', accountCode: 'Account Number',
        description: 'Description', entryType: 'Transaction Type', amount: 'Amount', reference: 'Reference Number',
        paymentMethod: 'Payment Method', status: 'Status', category: 'Category'
      }
    },
    values: {
      clientStatus: { Active: 'active', Inactive: 'inactive', Pending: 'pending' },
      entityType: {
        Corporation: 'corporation', 'S-Corporation': 's_corporation', LLC: 'llc', Partnership: 'partnership',
        'Sole Proprietorship': 'sole_proprietor', 'Non-Profit': 'non_profit'
      },
      paymentTerms: {
        'Due on Receipt': 'due_on_receipt', 'Net 15': 'net_15', 'Net 30': 'net_30', 'Net 45': 'net_45', 'Net 60': 'net_60'
      },
      contactActive: BOOLEAN_ACTIVE_ONLY,
      channel: { Email: 'email', Phone: 'phone' },
      accountType: { Asset: 'asset', Liability: 'liability', Equity: 'equity', Revenue: 'revenue', Expense: 'expense' },
      debitCredit: { Debit: 'debit', Credit: 'credit' },
      paymentMethod: {
        'Wire Transfer': 'wire_transfer', ACH: 'ach', Check: 'check', 'Credit Card': 'credit_card', Cash: 'cash',
        'Direct Deposit': 'direct_deposit', 'Bank Transfer': 'bank_transfer', 'Bank Charge': 'bank_charge',
        'Journal Entry': 'journal_entry', Financing: 'financing'
      },
      transactionStatus: { Cleared: 'completed', Pending: 'pending', Voided: 'cancelled' }
    }
  },
  {
    id: 'xyz-financial',
    label: 'XYZ Financial Services (camelCase, YYYY-MM-DD, USD)',
    dateOrder: 'YMD',
    currency: 'USD',
    personNameOrder: 'last_first',
    entities: {
      clients: {
        sourceId: 'clientCode', name: 'companyName', entityType: 'entityType', status: 'clientStatus',
        onboardedDate: 'startDate', taxId: 'federalTaxId', annualRevenue: 'yearlyRevenue', industry: 'sectorCode',
        paymentTerms: 'billingTerms', primaryContactName: 'mainContact'
      },
      contacts: {
        sourceId: 'contactId', clientSourceId: 'clientCode', firstName: 'firstName', lastName: 'lastName',
        email: 'emailAddress', phone: 'phoneNumber', role: 'jobTitle', isActive: 'isActive',
        preferredChannel: 'communicationPreference', department: 'businessUnit'
      },
      accounts: {
        code: 'acctCode', name: 'acctName', type: 'acctCategory', subType: 'acctSubCategory',
        normalBalance: 'balanceType', isActive: 'activeFlag', description: 'acctDescription', parentCode: 'parentAcctCode'
      },
      transactions: {
        sourceId: 'txnId', date: 'txnDate', clientSourceId: 'clientCode', accountCode: 'acctCode',
        description: 'memo', entryType: 'entryType', amount: 'txnAmount', reference: 'docNumber',
        paymentMethod: 'paymentType', status: 'txnStatus', category: 'expenseCategory'
      }
    },
    values: {
      clientStatus: { A: 'active', I: 'inactive', P: 'pending' },
      entityType: {
        CORP: 'corporation', SCORP: 's_corporation', LLC: 'llc', PART: 'partnership', SOLE: 'sole_proprietor',
        NPROF: 'non_profit'
      },
      paymentTerms: { COD: 'due_on_receipt', NET15: 'net_15', NET30: 'net_30', NET45: 'net_45', NET60: 'net_60' },
      contactActive: { Y: true, N: false, P: false },
      channel: { EMAIL: 'email', PHONE: 'phone', TEXT: 'sms' },
      accountType: { ASSET: 'asset', LIABILITY: 'liability', EQUITY: 'equity', REVENUE: 'revenue', EXPENSE: 'expense' },
      debitCredit: { DR: 'debit', CR: 'credit' },
      paymentMethod: {
        WIRE: 'wire_transfer', EFT: 'ach', ACH: 'ach', CHECK: 'check', CARD: 'credit_card', CASH: 'cash',
        BANK: 'bank_transfer', FEE: 'bank_charge', JE: 'journal_entry', LEASE: 'financing'
      },
      transactionStatus: { POSTED: 'completed', PENDING: 'pending', VOID: 'cancelled' }
    }
  },
  {
    id: 'premier-bookkeeping',
    label: 'Premier Bookkeeping (snake_case, DD-MM-YYYY, GBP)',
    dateOrder: 'DMY',
    currency: 'GBP',
    personNameOrder: 'first_last',
    entities: {
      clients: {
        sourceId: 'customer_id', name: 'business_name', entityType: 'legal_structure', status: 'account_status',
        onboardedDate: 'registration_date', taxId: 'tax_reference', annualRevenue: 'gross_revenue',
        industry: 'industry_sector', paymentTerms: 'credit_terms', primaryContactName: 'key_contact_name'
      },
      contacts: {
        sourceId: 'contact_ref', clientSourceId: 'customer_id', firstName: 'given_name', lastName: 'family_name',
        email: 'email', phone: 'telephone', role: 'position', isActive: 'contact_status',
        preferredChannel: 'preferred_channel', department: 'division'
      },
      accounts: {
        code: 'nominal_code', name: 'account_title', type: 'category', subType: 'sub_category',
        normalBalance: 'debit_credit', isActive: 'is_active', description: 'notes', parentCode: 'parent_code'
      },
      transactions: {
        sourceId: 'transaction_ref', date: 'posting_date', clientSourceId: 'customer_id', accountCode: 'nominal_code',
        description: 'narrative', entryType: 'dr_cr', amount: 'amount_gbp', reference: 'document_ref',
        paymentMethod: 'settlement_method', status: 'posting_status', category: 'cost_centre'
      }
    },
    values: {
      clientStatus: { ACTIVE: 'active', DORMANT: 'inactive', SUSPENDED: 'pending' },
      entityType: {
        'Limited Company': 'corporation', LLP: 'llc', Partnership: 'partnership', 'Sole Trader': 'sole_proprietor'
      },
      paymentTerms: {
        Immediate: 'due_on_receipt', '14 Days': 'net_14', '30 Days': 'net_30', '45 Days': 'net_45', '60 Days': 'net_60'
      },
      contactActive: { Active: true, Dormant: false, Suspended: false },
      channel: { Email: 'email', Phone: 'phone', SMS: 'sms' },
      accountType: {
        Assets: 'asset', Liabilities: 'liability', Capital: 'equity', Income: 'revenue',
        'Direct Costs': 'expense', Overheads: 'expense', 'Finance Costs': 'expense'
      },
      debitCredit: { D: 'debit', C: 'credit' },
      paymentMethod: {
        Wire: 'wire_transfer', BACS: 'ach', Cheque: 'check', 'Credit Card': 'credit_card', 'Card Payment': 'credit_card',
        Cash: 'cash', 'Petty Cash': 'cash', Bank: 'bank_transfer', 'Bank Transfer': 'bank_transfer',
        'Bank Charge': 'bank_charge', 'Direct Debit': 'direct_debit', 'Standing Order': 'standing_order',
        'Online Payment': 'online_payment', HP: 'financing'
      },
      transactionStatus: { Reconciled: 'completed', Unreconciled: 'pending', Cancelled: 'cancelled' }
    }
  }
];

module.exports = { MAPPINGS };
