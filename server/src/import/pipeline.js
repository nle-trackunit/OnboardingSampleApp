/**
 * Read → resolve mapping → normalize → validate. Pure: nothing here writes to the database.
 */

const { readCsv } = require('./csv');
const { ENTITIES, ENTITY_NAMES, CURRENCY_ENTITIES } = require('./schema');
const { MAPPINGS } = require('./mappings');
const { parseDate, parseAmount, parseBoolean, translate, formatPersonName } = require('./normalize');

const SAMPLE_SIZE = 5;

const sameHeaderSet = (a, b) => a.length === b.length && a.every(h => b.includes(h));

/**
 * Finds the mapping whose header signature for an entity matches the file's headers
 * @returns {{ mapping: object, entity: string } | null}
 */
function findMapping(headers, entity) {
  for (const mapping of MAPPINGS) {
    const columns = mapping.entities[entity];
    if (columns && sameHeaderSet(Object.values(columns), headers)) return { mapping, entity };
  }
  return null;
}

/**
 * Resolves the mapping for a file, or explains why none applies
 * @returns {{ mapping: object } | { error: 'wrong_entity', detectedEntity: string }
 *   | { error: 'unrecognized', unmatchedHeaders: string[], missingHeaders: string[] }}
 */
function resolveMapping(headers, entity) {
  const match = findMapping(headers, entity);
  if (match) return { mapping: match.mapping };

  for (const other of ENTITY_NAMES.filter(e => e !== entity)) {
    if (findMapping(headers, other)) return { error: 'wrong_entity', detectedEntity: other };
  }

  // Report against the closest known layout for this entity so the agent sees what differs
  const closest = MAPPINGS
    .map(m => Object.values(m.entities[entity]))
    .sort((a, b) => b.filter(h => headers.includes(h)).length - a.filter(h => headers.includes(h)).length)[0];
  return {
    error: 'unrecognized',
    unmatchedHeaders: headers.filter(h => !closest.includes(h)),
    missingHeaders: closest.filter(h => !headers.includes(h))
  };
}

/**
 * Normalizes one row's fields into a canonical record
 * @returns {{ record: object, errors: string[], review: { field: string, raw: string }[] }}
 */
function normalizeRow(fields, headers, entity, mapping) {
  const record = {};
  const errors = [];
  const review = [];
  const columns = mapping.entities[entity];

  for (const field of ENTITIES[entity].fields) {
    const raw = (fields[headers.indexOf(columns[field.key])] ?? '').trim();
    if (raw === '') {
      if (field.required) errors.push(`${field.key} is required`);
      record[field.key] = null;
      continue;
    }

    switch (field.type) {
      case 'date':
      case 'amount': {
        const parsed = field.type === 'date' ? parseDate(raw, mapping.dateOrder) : parseAmount(raw);
        if (parsed.error) errors.push(`${field.key}: ${parsed.error}`);
        record[field.key] = parsed.value ?? null;
        break;
      }
      case 'boolean': {
        const value = parseBoolean(raw);
        if (value === undefined) review.push({ field: field.key, raw });
        record[field.key] = value ?? null;
        break;
      }
      case 'picklist': {
        const value = translate(mapping.values[field.table] || {}, raw);
        if (value === undefined) review.push({ field: field.key, raw });
        record[field.key] = value ?? null;
        break;
      }
      case 'personName':
        record[field.key] = formatPersonName(raw, mapping.personNameOrder);
        break;
      default:
        record[field.key] = raw;
    }
  }

  if (CURRENCY_ENTITIES.has(entity)) record.currency = mapping.currency;
  return { record, errors, review };
}

/**
 * Lines a row up against the header. Surplus fields can only come from unquoted commas, so the
 * row is rejoined at each free-text column in turn and accepted only if exactly one rejoin gives
 * a row with no errors and nothing to review. Anything else is rejected, never imported shifted.
 * @returns {{ normalized: object } | { reason: string }}
 */
function fitRow(fields, headers, entity, mapping) {
  if (fields.length === headers.length) return { normalized: normalizeRow(fields, headers, entity, mapping) };

  const surplus = fields.length - headers.length;
  const mismatch = { reason: `column count mismatch (${fields.length} fields, expected ${headers.length})` };
  if (surplus < 0) return mismatch;

  const columns = mapping.entities[entity];
  const clean = ENTITIES[entity].fields
    .filter(f => f.freeText)
    .map(f => headers.indexOf(columns[f.key]))
    .map(index => {
      const rejoined = [
        ...fields.slice(0, index),
        fields.slice(index, index + surplus + 1).join(','),
        ...fields.slice(index + surplus + 1)
      ];
      return normalizeRow(rejoined, headers, entity, mapping);
    })
    .filter(n => n.errors.length === 0 && n.review.length === 0);

  return clean.length === 1 ? { normalized: clean[0] } : mismatch;
}

/**
 * Prepares a file for import
 * @param {Object} input
 * @param {string} input.entity - 'clients' | 'contacts' | 'accounts' | 'transactions'
 * @param {string} input.text - File contents
 * @param {{ hasClient: (id: string) => boolean, hasAccount: (code: string) => boolean }} input.lookups
 *   Whether a parent already exists in the tenant
 */
function prepareImport({ entity, text, lookups }) {
  if (!ENTITIES[entity]) return { error: 'unknown_entity' };
  if (typeof text !== 'string' || text.includes('\u0000')) return { error: 'unreadable' };

  const { headers, records } = readCsv(text);
  if (headers.length < 2) return { error: 'unreadable' };

  const resolved = resolveMapping(headers, entity);
  if (resolved.error) return resolved;
  const { mapping } = resolved;
  const { idKey, fields } = ENTITIES[entity];

  const rejected = [];
  let candidates = [];
  const seenIds = new Set();
  for (const { line, raw, fields: values } of records) {
    const fitted = fitRow(values, headers, entity, mapping);
    if (fitted.reason) {
      rejected.push({ line, raw, reason: fitted.reason });
      continue;
    }
    const { record, errors, review } = fitted.normalized;
    if (errors.length > 0) {
      rejected.push({ line, raw, reason: errors.join('; ') });
    } else if (seenIds.has(record[idKey])) {
      rejected.push({ line, raw, reason: `duplicate ${record[idKey]} in this file` });
    } else {
      seenIds.add(record[idKey]);
      candidates.push({ line, raw, record, review });
    }
  }

  // Reference checks run until stable, so a row whose in-file parent was rejected is rejected too
  const referenceFields = fields.filter(f => f.references);
  let changed = true;
  while (changed) {
    changed = false;
    const fileAccountCodes = new Set(entity === 'accounts' ? candidates.map(c => c.record.code) : []);
    candidates = candidates.filter(candidate => {
      for (const field of referenceFields) {
        const value = candidate.record[field.key];
        if (value === null) continue;
        const exists = field.references === 'clients'
          ? lookups.hasClient(value)
          : fileAccountCodes.has(value) || lookups.hasAccount(value);
        if (!exists) {
          const noun = field.key === 'parentCode' ? 'parent account' : field.references === 'clients' ? 'client' : 'account';
          rejected.push({ line: candidate.line, raw: candidate.raw, reason: `${noun} ${value} not found in this tenant` });
          changed = true;
          return false;
        }
      }
      return true;
    });
  }

  rejected.sort((a, b) => a.line - b.line);
  const flagged = candidates.filter(c => c.review.length > 0);
  return {
    mapping: { id: mapping.id, label: mapping.label },
    headers,
    rowsRead: records.length,
    rowsValid: candidates.length,
    rowsRejected: rejected.length,
    rowsFlagged: flagged.length,
    rows: candidates.map(({ line, record, review }) => ({ line, record, review })),
    rejected,
    flagged: flagged.map(({ line, record, review }) => ({ line, sourceId: record[idKey], review })),
    sample: candidates.slice(0, SAMPLE_SIZE).map(c => c.record)
  };
}

module.exports = { prepareImport, resolveMapping, fitRow, normalizeRow };
