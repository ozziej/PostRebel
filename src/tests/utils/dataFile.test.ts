import { describe, it, expect } from 'vitest';
import { parseCsv, csvRowsToRecords, parseDataRows, detectDataFileFormat } from '../../utils/dataFile';

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles a quoted field containing a comma', () => {
    expect(parseCsv('name,note\n"Doe, Jane",hello')).toEqual([['name', 'note'], ['Doe, Jane', 'hello']]);
  });

  it('handles a quoted field containing a newline', () => {
    expect(parseCsv('name,note\n"line1\nline2",x')).toEqual([['name', 'note'], ['line1\nline2', 'x']]);
  });

  it('handles an escaped double-quote inside a quoted field', () => {
    expect(parseCsv('name\n"She said ""hi"""')).toEqual([['name'], ['She said "hi"']]);
  });

  it('handles a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('drops a single trailing blank line', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('csvRowsToRecords', () => {
  it('maps header row onto each data row', () => {
    const records = csvRowsToRecords([['userId', 'name'], ['1', 'Alice'], ['2', 'Bob']]);
    expect(records).toEqual([{ userId: '1', name: 'Alice' }, { userId: '2', name: 'Bob' }]);
  });

  it('returns an empty array when there is only a header (no data rows)', () => {
    expect(csvRowsToRecords([['userId', 'name']])).toEqual([]);
  });

  it('returns an empty array for no rows at all', () => {
    expect(csvRowsToRecords([])).toEqual([]);
  });

  it('trims header whitespace and skips blank header columns', () => {
    const records = csvRowsToRecords([[' userId ', ''], ['1', 'ignored']]);
    expect(records).toEqual([{ userId: '1' }]);
  });

  it('fills a missing trailing value as an empty string when a row is short', () => {
    const records = csvRowsToRecords([['a', 'b'], ['1']]);
    expect(records).toEqual([{ a: '1', b: '' }]);
  });
});

describe('parseDataRows', () => {
  it('parses CSV content end-to-end', () => {
    const result = parseDataRows('userId,name\n1,Alice\n2,Bob', 'csv');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ userId: '1', name: 'Alice' }, { userId: '2', name: 'Bob' }]);
  });

  it('parses a JSON array of flat objects', () => {
    const result = parseDataRows(JSON.stringify([{ userId: '1', active: true }, { userId: '2', active: false }]), 'json');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ userId: '1', active: 'true' }, { userId: '2', active: 'false' }]);
  });

  it('stringifies nested object/array values in a JSON data file', () => {
    const result = parseDataRows(JSON.stringify([{ item: { id: 1 } }]), 'json');
    expect(result.rows).toEqual([{ item: '{"id":1}' }]);
  });

  it('errors when the JSON data file is not an array', () => {
    const result = parseDataRows(JSON.stringify({ userId: '1' }), 'json');
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/must be an array/);
  });

  it('errors on invalid JSON', () => {
    const result = parseDataRows('{not valid', 'json');
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/Invalid JSON/);
  });
});

describe('detectDataFileFormat', () => {
  it('detects .json by extension', () => {
    expect(detectDataFileFormat('rows.JSON')).toBe('json');
  });

  it('defaults everything else to csv', () => {
    expect(detectDataFileFormat('rows.csv')).toBe('csv');
    expect(detectDataFileFormat('rows.txt')).toBe('csv');
  });
});
