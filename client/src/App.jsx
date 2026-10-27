import React, { useState, useEffect } from 'react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customer-info', label: 'Customer Info' },
  { id: 'data-mapping', label: 'Data Mapping' },
  { id: 'tenant-setup', label: 'Tenant Setup' },
  { id: 'import', label: 'Import' }
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [onboardingData, setOnboardingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOnboarding = () => {
    return fetch('/api/onboarding')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setOnboardingData(data);
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch onboarding data:', err);
        setError(err.message);
        setOnboardingData([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadOnboarding();
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Onboarding Dashboard</h1>
        <p>Customer Success Team - Internal Tool</p>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'dashboard' && (
          <DashboardTab data={onboardingData} loading={loading} error={error} />
        )}
        {activeTab === 'customer-info' && (
          <CustomerInfoTab onCustomerCreated={loadOnboarding} />
        )}
        {activeTab === 'data-mapping' && (
          <DataMappingTab onMappingSaved={loadOnboarding} />
        )}
        {activeTab === 'tenant-setup' && (
          <PlaceholderTab title="Tenant Setup" description="Provision and configure customer tenant" />
        )}
        {activeTab === 'import' && (
          <PlaceholderTab title="Import" description="Import customer data into the platform" />
        )}
      </main>
    </div>
  );
}

function DashboardTab({ data, loading, error }) {
  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load onboarding data</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="placeholder"><p>No customers in the onboarding queue</p></div>;
  }

  return (
    <div>
      <h2>Onboarding Queue</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {data.length} customer(s) awaiting onboarding
      </p>

      {data.map(item => (
        <div key={item.customerId} className="customer-card">
          <h3>{item.customerName}</h3>
          <div className="customer-meta">
            <span>📍 {item.customerRegion}</span>
            <span>🏭 {item.customerIndustry}</span>
          </div>

          <div className="progress-section">
            <ProgressBar percent={item.progressPercent} />
            <Checklist steps={item.steps} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar" 
        style={{ width: `${Math.max(percent, 0)}%` }}
      >
        {percent > 0 ? `${percent}%` : ''}
      </div>
    </div>
  );
}

function Checklist({ steps }) {
  return (
    <ul className="checklist">
      {steps.map(step => (
        <li key={step.id}>
          <span className={`step-status ${step.status}`}>
            {step.status === 'completed' ? '✓' : step.order}
          </span>
          <span>{step.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#9ca3af' }}>
            {step.status.replace('_', ' ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

const EMPTY_CUSTOMER = { name: '', industry: '', region: '', contactEmail: '' };

const CUSTOMER_FIELDS = [
  { name: 'name', label: 'Customer name', type: 'text', placeholder: 'Acme Corporation' },
  { name: 'industry', label: 'Industry', type: 'text', placeholder: 'Manufacturing' },
  { name: 'region', label: 'Region', type: 'text', placeholder: 'North America' },
  { name: 'contactEmail', label: 'Contact email', type: 'email', placeholder: 'onboarding@acme.example.com' }
];

function CustomerInfoTab({ onCustomerCreated }) {
  const [form, setForm] = useState(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [created, setCreated] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setCreated(null);

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 400 && body.errors) {
        setErrors(body.errors);
        return;
      }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      setCreated(body);
      setForm(EMPTY_CUSTOMER);
      setErrors({});
      onCustomerCreated?.();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Customer Info</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Collect and validate customer information
      </p>

      {created && (
        <div className="form-alert success" role="status">
          ✓ {created.name} was added to the onboarding queue
        </div>
      )}
      {submitError && (
        <div className="form-alert error" role="alert">
          ⚠️ Failed to save customer: {submitError}
        </div>
      )}

      <form className="customer-form" onSubmit={handleSubmit} noValidate>
        {CUSTOMER_FIELDS.map(field => (
          <div key={field.name} className="form-field">
            <label htmlFor={field.name}>{field.label}</label>
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              value={form[field.name]}
              onChange={handleChange}
              aria-invalid={Boolean(errors[field.name])}
            />
            {errors[field.name] && (
              <span className="field-error">{errors[field.name]}</span>
            )}
          </div>
        ))}

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save customer'}
        </button>
      </form>
    </div>
  );
}

const PREVIEW_ROWS = 5;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);

  const [headers = [], ...records] = rows;
  return { headers: headers.map(h => h.trim()), records };
}

const normalizeHeader = (header) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

function suggestColumns(fields, headers) {
  const columns = {};
  const used = new Set();
  for (const field of fields) {
    const candidates = [field.key, field.label, ...field.aliases].map(normalizeHeader);
    const match = headers.find(h => !used.has(h) && candidates.includes(normalizeHeader(h)));
    if (match) {
      columns[field.key] = match;
      used.add(match);
    }
  }
  return columns;
}

function DataMappingTab({ onMappingSaved }) {
  const entity = 'clients';
  const [customers, setCustomers] = useState([]);
  const [fields, setFields] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState(null);
  const [columns, setColumns] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/customers').then(res => res.json()),
      fetch('/api/mapping/fields').then(res => res.json())
    ])
      .then(([customerList, targetFields]) => {
        setCustomers(customerList);
        setFields(targetFields[entity] || []);
        if (customerList.length > 0) setCustomerId(customerList[customerList.length - 1].id);
      })
      .catch(err => setMessage({ type: 'error', text: `Failed to load mapping setup: ${err.message}` }));
  }, []);

  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/customers/${customerId}/mappings`)
      .then(res => (res.ok ? res.json() : []))
      .then(mappings => {
        const saved = mappings.find(m => m.entity === entity);
        setCsv(saved ? { headers: saved.sourceHeaders, records: [] } : null);
        setColumns(saved ? saved.columns : {});
        setFileName('');
        setErrors({});
        setMessage(saved ? { type: 'success', text: 'Loaded saved mapping' } : null);
      });
  }, [customerId]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setCsv(parsed);
    setColumns(suggestColumns(fields, parsed.headers));
    setErrors({});
    setMessage(null);
  };

  const handleColumnChange = (key, value) => {
    setColumns(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/mappings/${entity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceHeaders: csv.headers, columns })
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.errors) {
        setErrors(body.errors);
        return;
      }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      setErrors({});
      setMessage({ type: 'success', text: 'Client mapping saved' });
      onMappingSaved?.();
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to save mapping: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const mappedFields = fields.filter(f => columns[f.key]);
  const previewRows = csv?.records.slice(0, PREVIEW_ROWS) ?? [];

  return (
    <div>
      <h2>Data Mapping</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Map the columns of a customer's clients file to platform fields
      </p>

      {message && (
        <div className={`form-alert ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.type === 'success' ? '✓' : '⚠️'} {message.text}
        </div>
      )}

      <div className="customer-form">
        <div className="form-field">
          <label htmlFor="mapping-customer">Customer</label>
          <select
            id="mapping-customer"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
          >
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="mapping-file">Clients CSV file</label>
          <input id="mapping-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
          {fileName && <span className="field-hint">{fileName}: {csv.headers.length} columns, {csv.records.length} rows</span>}
        </div>
      </div>

      {csv && (
        <>
          <h3 className="section-title">Column mapping</h3>
          <table className="mapping-table">
            <thead>
              <tr><th>Platform field</th><th>Customer column</th></tr>
            </thead>
            <tbody>
              {fields.map(field => (
                <tr key={field.key}>
                  <td>
                    <label htmlFor={`map-${field.key}`}>
                      {field.label}{field.required && <span className="required"> *</span>}
                    </label>
                  </td>
                  <td>
                    <select
                      id={`map-${field.key}`}
                      value={columns[field.key] || ''}
                      onChange={e => handleColumnChange(field.key, e.target.value)}
                      aria-invalid={Boolean(errors[field.key])}
                    >
                      <option value="">— Not mapped —</option>
                      {csv.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {errors[field.key] && <span className="field-error">{errors[field.key]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {previewRows.length > 0 && mappedFields.length > 0 && (
            <>
              <h3 className="section-title">Preview (first {previewRows.length} rows)</h3>
              <div className="preview-wrapper">
                <table className="mapping-table preview">
                  <thead>
                    <tr>{mappedFields.map(f => <th key={f.key}>{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((record, i) => (
                      <tr key={i}>
                        {mappedFields.map(f => (
                          <td key={f.key}>{record[csv.headers.indexOf(columns[f.key])] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={saving || !customerId}
          >
            {saving ? 'Saving...' : 'Save mapping'}
          </button>
        </>
      )}
    </div>
  );
}

function PlaceholderTab({ title, description }) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>{description}</p>
      <p style={{ marginTop: '20px', fontSize: '0.9rem' }}>
        🚧 This section is ready to be built
      </p>
    </div>
  );
}

export default App;
