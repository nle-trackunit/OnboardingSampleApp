const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readCsv, createCsvParser } = require('./csv');

describe('readCsv', () => {
  it('should read headers and records with their line numbers and raw text', () => {
    const { headers, records } = readCsv('a,b\n1,2\n3,4\n');
    assert.deepStrictEqual(headers, ['a', 'b']);
    assert.deepStrictEqual(records, [
      { line: 2, raw: '1,2', fields: ['1', '2'] },
      { line: 3, raw: '3,4', fields: ['3', '4'] }
    ]);
  });

  it('should strip a UTF-8 BOM and read CRLF line endings', () => {
    const { headers, records } = readCsv('\uFEFFClient ID,Name\r\nC001,Acme\r\n');
    assert.deepStrictEqual(headers, ['Client ID', 'Name']);
    assert.deepStrictEqual(records[0].fields, ['C001', 'Acme']);
  });

  it('should skip blank and trailing blank lines without counting them', () => {
    const { records } = readCsv('a,b\n1,2\n\n3,4\n\n\n');
    assert.deepStrictEqual(records.map(r => r.line), [2, 4]);
  });

  it('should honour quoted fields with commas, escaped quotes and newlines', () => {
    const { records } = readCsv('a,b\n"Williams, Robert","say ""hi""\nthere"\n');
    assert.deepStrictEqual(records[0].fields, ['Williams, Robert', 'say "hi"\nthere']);
  });

  it('should keep ragged rows as found, with surplus fields in the last column', () => {
    const { records } = readCsv('code,name,contact\nXYZ-001,Apex,Williams, Robert\n');
    assert.deepStrictEqual(records[0].fields, ['XYZ-001', 'Apex', 'Williams', ' Robert']);
  });

  it('should keep ragged rows as found, with surplus fields mid-row', () => {
    const { records } = readCsv('code,description,parent\n6300,Electric, gas, water,6000\n');
    assert.deepStrictEqual(records[0].fields, ['6300', 'Electric', ' gas', ' water', '6000']);
    assert.strictEqual(records[0].raw, '6300,Electric, gas, water,6000');
  });

  it('should read the same records when the input arrives in arbitrary chunks', () => {
    const text = '\uFEFFa,b\r\n"x,""y""",2\r\n3,4';
    const parser = createCsvParser();
    const chunked = [...text].flatMap(char => parser.push(char)).concat(parser.end());
    const whole = createCsvParser();
    assert.deepStrictEqual(chunked, [...whole.push(text), ...whole.end()]);
  });
});
