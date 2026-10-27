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
          <TenantSetupTab onProvisioned={loadOnboarding} onNavigate={setActiveTab} />
        )}
        {activeTab === 'import' && (
          <ImportTab onImported={loadOnboarding} onNavigate={setActiveTab} />
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
    const getJson = (url) => fetch(url).then(res => {
      if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
      return res.json();
    });

    Promise.all([getJson('/api/customers'), getJson('/api/mapping/fields')])
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

const PLANS = ['starter', 'professional', 'enterprise'];

function TenantSetupTab({ onProvisioned, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [plan, setPlan] = useState('starter');
  const [errors, setErrors] = useState({});
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    const getJson = (url) => fetch(url).then(res => {
      if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
      return res.json();
    });

    return Promise.all([getJson('/api/customers'), getJson('/api/tenants')])
      .then(([customerList, tenantList]) => {
        setCustomers(customerList);
        setTenants(tenantList);
      })
      .catch(err => setMessage({ type: 'error', text: `Failed to load tenants: ${err.message}` }));
  };

  useEffect(() => {
    load();
  }, []);

  // A customer with no tenant row and one with a 'pending' row are both not provisioned
  const activeTenantFor = (customerId) =>
    tenants.find(t => t.customerId === customerId && t.status === 'active');
  const provisioned = customers.filter(c => activeTenantFor(c.id));
  const notProvisioned = customers.filter(c => !activeTenantFor(c.id));

  const choose = (customer) => {
    const pending = tenants.find(t => t.customerId === customer.id);
    setSelected(customer);
    setPlan(pending?.plan || 'starter');
    setErrors({});
    setMessage(null);
  };

  const handleProvision = async () => {
    if (provisioning) return;
    setProvisioning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 400 && body.errors) {
        setErrors(body.errors);
        return;
      }
      if (res.status === 422) {
        setMessage({ type: 'error', text: body.error, resolveOnCustomer: true });
        return;
      }
      if (!res.ok) {
        throw new Error(body.error || 'Provisioning did not complete. Nothing was changed, so you can try again.');
      }

      setMessage({
        type: 'success',
        text: `${selected.name} is provisioned on the ${body.plan} plan in ${body.region}`
      });
      setSelected(null);
      onProvisioned?.();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProvisioning(false);
      load();
    }
  };

  return (
    <div>
      <h2>Tenant Setup</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Provision a tenant for each customer
      </p>

      {message && (
        <div className={`form-alert ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.type === 'success' ? '✓' : '⚠️'} {message.text}
          {message.resolveOnCustomer && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => onNavigate?.('customer-info')}>
                Go to Customer Info
              </button>
            </>
          )}
        </div>
      )}

      <h3 className="section-title">Not provisioned ({notProvisioned.length})</h3>
      {notProvisioned.length === 0 ? (
        <p className="field-hint">Every customer is provisioned</p>
      ) : (
        <table className="mapping-table tenant-table">
          <thead>
            <tr><th>Customer</th><th>Region</th><th>Industry</th><th></th></tr>
          </thead>
          <tbody>
            {notProvisioned.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.region}</td>
                <td>{c.industry}</td>
                <td>
                  <button type="button" className="secondary-button" onClick={() => choose(c)} disabled={provisioning}>
                    Provision
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="provision-panel" aria-label={`Provision ${selected.name}`} role="group">
          <h3>Provision {selected.name}</h3>
          <div className="form-field">
            <label htmlFor="tenant-plan">Plan</label>
            <select
              id="tenant-plan"
              value={plan}
              onChange={e => { setPlan(e.target.value); setErrors({}); }}
              aria-invalid={Boolean(errors.plan)}
            >
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {errors.plan && <span className="field-error">{errors.plan}</span>}
          </div>
          <p className="field-hint">Region: <strong>{selected.region || '—'}</strong> (from the customer record)</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={handleProvision} disabled={provisioning}>
              {provisioning ? 'Provisioning...' : 'Confirm provision'}
            </button>
            <button type="button" className="secondary-button" onClick={() => setSelected(null)} disabled={provisioning}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <h3 className="section-title">Provisioned ({provisioned.length})</h3>
      {provisioned.length === 0 ? (
        <p className="field-hint">No customers are provisioned yet</p>
      ) : (
        <table className="mapping-table tenant-table">
          <thead>
            <tr><th>Customer</th><th>Plan</th><th>Region</th><th>Provisioned</th></tr>
          </thead>
          <tbody>
            {provisioned.map(c => {
              const tenant = activeTenantFor(c.id);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{tenant.plan}</td>
                  <td>{tenant.region}</td>
                  <td>{new Date(tenant.provisionedAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ImportTab({ onImported, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [imports, setImports] = useState(null);
  const [entity, setEntity] = useState('clients');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/customers')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(list => {
        setCustomers(list);
        if (list.length > 0) setCustomerId(list[0].id);
      })
      .catch(err => setMessage({ type: 'error', text: `Failed to load customers: ${err.message}` }));
  }, []);

  const loadImports = (id = customerId) => {
    if (!id) return Promise.resolve();
    return fetch(`/api/customers/${id}/imports`)
      .then(res => (res.ok ? res.json() : null))
      .then(setImports);
  };

  useEffect(() => {
    setFile(null);
    setPreview(null);
    setMessage(null);
    loadImports(customerId);
  }, [customerId]);

  const upload = async (url, selected) => {
    const res = await fetch(`${url}?filename=${encodeURIComponent(selected.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: await selected.text()
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  };

  const showError = (body, fallback) => setMessage({
    type: 'error',
    text: body.error || fallback,
    headers: body.unmatchedHeaders,
    link: body.code === 'not_provisioned' ? 'tenant-setup' : null
  });

  const handleFile = async (e) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setMessage(null);
    setBusy(true);
    try {
      const { res, body } = await upload(`/api/customers/${customerId}/imports/${entity}/preview`, selected);
      if (!res.ok) return showError(body, `Preview failed (HTTP ${res.status})`);
      setPreview(body);
    } catch (err) {
      setMessage({ type: 'error', text: "That file couldn't be read" });
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { res, body } = await upload(`/api/customers/${customerId}/imports/${entity}`, file);
      if (!res.ok) return showError(body, 'The import did not complete. Nothing was written, so you can upload the file again.');

      const label = imports.entities.find(x => x.entity === entity).label;
      const text = body.outcome === 'duplicate'
        ? `${label}: this file was already imported, nothing changed`
        : body.outcome === 'nothing_to_import'
          ? `${label}: no valid rows, nothing was written`
          : `${label}: imported ${body.rowsValid} rows`;
      setMessage({ type: 'success', text });
      setFile(null);
      setPreview(null);
      onImported?.();
    } catch (err) {
      setMessage({ type: 'error', text: 'The import did not complete. Nothing was written, so you can upload the file again.' });
    } finally {
      setBusy(false);
      loadImports();
    }
  };

  const entities = imports?.entities || [];
  const imported = new Set(entities.filter(x => x.run).map(x => x.entity));
  const selectedEntity = entities.find(x => x.entity === entity);
  const blockedBy = selectedEntity?.requires.filter(r => !imported.has(r)) || [];
  const sampleKeys = preview?.sample[0] ? Object.keys(preview.sample[0]) : [];

  return (
    <div>
      <h2>Import</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Load a customer's clients, chart of accounts, contacts and transactions into their tenant
      </p>

      {message && (
        <div className={`form-alert ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.type === 'success' ? '✓' : '⚠️'} {message.text}
          {message.headers?.length > 0 && <> — unmatched headers: {message.headers.join(', ')}</>}
          {message.link && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => onNavigate?.(message.link)}>
                Go to Tenant Setup
              </button>
            </>
          )}
        </div>
      )}

      <div className="customer-form">
        <div className="form-field">
          <label htmlFor="import-customer">Customer</label>
          <select id="import-customer" value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={busy}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {imports && !imports.provisioned && (
        <div className="form-alert error" role="alert" style={{ marginTop: '16px' }}>
          ⚠️ Provision a tenant before importing{' '}
          <button type="button" className="link-button" onClick={() => onNavigate?.('tenant-setup')}>
            Go to Tenant Setup
          </button>
        </div>
      )}

      {imports?.provisioned && (
        <>
          <h3 className="section-title">Entity types</h3>
          <table className="mapping-table tenant-table">
            <thead>
              <tr><th></th><th>Entity</th><th>State</th><th>Rows in tenant</th></tr>
            </thead>
            <tbody>
              {entities.map(x => (
                <tr key={x.entity}>
                  <td>
                    <input
                      type="radio"
                      name="import-entity"
                      id={`entity-${x.entity}`}
                      checked={entity === x.entity}
                      onChange={() => { setEntity(x.entity); setFile(null); setPreview(null); setMessage(null); }}
                      disabled={busy}
                    />
                  </td>
                  <td><label htmlFor={`entity-${x.entity}`}>{x.label}</label></td>
                  <td>
                    {x.run
                      ? `Imported ${new Date(x.run.committedAt).toLocaleString()} from ${x.run.filename}`
                      : 'Not imported'}
                  </td>
                  <td>{x.rowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {blockedBy.length > 0 ? (
            <p className="field-hint">
              Import {blockedBy.map(r => entities.find(x => x.entity === r).label.toLowerCase()).join(' and ')} first.
            </p>
          ) : (
            <div className="form-field" style={{ maxWidth: '480px' }}>
              <label htmlFor="import-file">{selectedEntity?.label} CSV file</label>
              <input id="import-file" type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} />
              {file && <span className="field-hint">{file.name}</span>}
            </div>
          )}
        </>
      )}

      {preview && (
        <>
          <h3 className="section-title">Preview</h3>
          <p className="field-hint">Mapping applied: <strong>{preview.mapping.label}</strong></p>
          <ul className="import-counts">
            <li><strong>{preview.rowsRead}</strong> read</li>
            <li><strong>{preview.rowsValid}</strong> valid</li>
            <li><strong>{preview.rowsRejected}</strong> rejected</li>
            <li><strong>{preview.rowsFlagged}</strong> flagged for review</li>
          </ul>

          {preview.rejected.length > 0 && (
            <>
              <h4 className="section-title">Rejected rows</h4>
              <table className="mapping-table preview">
                <thead><tr><th>Line</th><th>Reason</th><th>Raw line</th></tr></thead>
                <tbody>
                  {preview.rejected.map(r => (
                    <tr key={r.line}><td>{r.line}</td><td>{r.reason}</td><td><code>{r.raw}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {preview.flagged.length > 0 && (
            <>
              <h4 className="section-title">Flagged for review</h4>
              <table className="mapping-table preview">
                <thead><tr><th>Line</th><th>Record</th><th>Unmapped values</th></tr></thead>
                <tbody>
                  {preview.flagged.map(f => (
                    <tr key={f.line}>
                      <td>{f.line}</td>
                      <td>{f.sourceId}</td>
                      <td>{f.review.map(r => `${r.field}: "${r.raw}"`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {preview.sample.length > 0 && (
            <>
              <h4 className="section-title">Sample of normalized rows</h4>
              <div className="preview-wrapper">
                <table className="mapping-table preview">
                  <thead><tr>{sampleKeys.map(k => <th key={k}>{k}</th>)}</tr></thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i}>{sampleKeys.map(k => <td key={k}>{row[k] === null ? '' : String(row[k])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={handleCommit}
            disabled={busy || preview.rowsValid === 0}
            style={{ marginTop: '16px' }}
          >
            {busy ? 'Importing...' : `Import ${preview.rowsValid} rows`}
          </button>
        </>
      )}
    </div>
  );
}

export default App;
