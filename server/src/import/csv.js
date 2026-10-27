/**
 * Incremental CSV reader.
 *
 * Accepts the input in chunks so a large file never has to be one string, strips a UTF-8 BOM,
 * reads CRLF and LF alike, honours RFC-4180 quoting, and skips blank lines. Rows are returned
 * exactly as found: a row with the wrong number of fields is not repaired here, because whether
 * it can be repaired depends on the mapping (see fitRow in pipeline.js).
 */

/**
 * @typedef {Object} CsvRecord
 * @property {number} line - 1-based line number the record starts on
 * @property {string} raw - The record's raw text, without its line ending
 * @property {string[]} fields
 */

function createCsvParser() {
  let field = '';
  let fields = [];
  let raw = '';
  let inQuotes = false;
  let pendingQuote = false;
  let skipLf = false;
  let atStart = true;
  let line = 1;
  let recordLine = 1;

  function finishRecord(records) {
    fields.push(field);
    if (fields.length > 1 || fields[0].trim() !== '') {
      records.push({ line: recordLine, raw, fields });
    }
    field = '';
    fields = [];
    raw = '';
  }

  /**
   * @param {string} chunk
   * @returns {CsvRecord[]} Records completed by this chunk
   */
  function push(chunk) {
    const records = [];
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      if (atStart) {
        atStart = false;
        if (char === '\uFEFF') continue;
      }
      if (skipLf) {
        skipLf = false;
        if (char === '\n') continue;
      }
      if (pendingQuote) {
        pendingQuote = false;
        if (char === '"') {
          field += '"';
          raw += char;
          continue;
        }
        inQuotes = false;
      }

      if (inQuotes) {
        if (char === '"') {
          pendingQuote = true;
        } else {
          if (char === '\n' || char === '\r') line++;
          field += char;
        }
        raw += char;
        continue;
      }

      if (char === '"' && field === '') {
        inQuotes = true;
        raw += char;
      } else if (char === ',') {
        fields.push(field);
        field = '';
        raw += char;
      } else if (char === '\n' || char === '\r') {
        finishRecord(records);
        if (char === '\r') skipLf = true;
        line++;
        recordLine = line;
      } else {
        field += char;
        raw += char;
      }
    }
    return records;
  }

  /** @returns {CsvRecord[]} The final record, if the input did not end with a newline */
  function end() {
    const records = [];
    if (field !== '' || fields.length > 0) finishRecord(records);
    return records;
  }

  return { push, end };
}

/**
 * Reads a whole CSV text
 * @param {string} text
 * @returns {{ headers: string[], records: CsvRecord[] }}
 */
function readCsv(text) {
  const parser = createCsvParser();
  const [header, ...records] = [...parser.push(text), ...parser.end()];
  return { headers: header ? header.fields.map(h => h.trim()) : [], records };
}

module.exports = { createCsvParser, readCsv };
