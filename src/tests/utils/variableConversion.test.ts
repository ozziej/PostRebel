import { describe, it, expect } from 'vitest';
import { toKeyValuePairs, fromKeyValuePairs } from '../../utils/variableConversion';

describe('toKeyValuePairs', () => {
  it('prefers variablesArray when present, preserving isSecret', () => {
    const result = toKeyValuePairs(
      [{ key: 'token', value: 'abc', isSecret: true }],
      { token: 'abc', stale: 'ignored' }
    );
    expect(result).toEqual([{ key: 'token', value: 'abc', enabled: true, isSecret: true }]);
  });

  it('falls back to the legacy flat variables map when there is no variablesArray', () => {
    const result = toKeyValuePairs(undefined, { host: 'example.com' });
    expect(result).toEqual([{ key: 'host', value: 'example.com', enabled: true, isSecret: false }]);
  });

  it('falls back to a single empty row when there is nothing at all', () => {
    expect(toKeyValuePairs(undefined, undefined)).toEqual([{ key: '', value: '', enabled: true, isSecret: false }]);
    expect(toKeyValuePairs([], {})).toEqual([{ key: '', value: '', enabled: true, isSecret: false }]);
  });
});

describe('fromKeyValuePairs', () => {
  it('converts rows into variablesArray and a synced flat variables map', () => {
    const result = fromKeyValuePairs([
      { key: 'apiBase', value: 'https://api.example.com', enabled: true, isSecret: false },
      { key: 'token', value: 'secret-value', enabled: true, isSecret: true },
    ]);
    expect(result.variablesArray).toEqual([
      { key: 'apiBase', value: 'https://api.example.com', isSecret: false },
      { key: 'token', value: 'secret-value', isSecret: true },
    ]);
    expect(result.variables).toEqual({ apiBase: 'https://api.example.com', token: 'secret-value' });
  });

  it('drops rows with an empty key', () => {
    const result = fromKeyValuePairs([
      { key: '', value: 'orphaned', enabled: true },
      { key: 'kept', value: 'yes', enabled: true },
    ]);
    expect(result.variablesArray).toEqual([{ key: 'kept', value: 'yes', isSecret: false }]);
    expect(result.variables).toEqual({ kept: 'yes' });
  });

  it('round-trips through toKeyValuePairs', () => {
    const original = [{ key: 'a', value: '1', isSecret: false }, { key: 'b', value: '2', isSecret: true }];
    const rows = toKeyValuePairs(original, { a: '1', b: '2' });
    const { variablesArray } = fromKeyValuePairs(rows);
    expect(variablesArray).toEqual(original);
  });
});
