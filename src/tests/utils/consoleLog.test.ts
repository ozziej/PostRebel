import { describe, it, expect } from 'vitest';
import { appendLogEntry, MAX_CONSOLE_LOG_ENTRIES } from '../../utils/consoleLog';
import { RunnerLogEntry } from '../../types';

describe('appendLogEntry', () => {
  it('appends a new entry with the given level, message, and timestamp', () => {
    const result = appendLogEntry([], 'info', 'hello', 1000);
    expect(result).toEqual([{ level: 'info', message: 'hello', timestamp: 1000 }]);
  });

  it('preserves existing entries in order', () => {
    const first = appendLogEntry([], 'info', 'first', 1);
    const second = appendLogEntry(first, 'success', 'second', 2);
    expect(second).toEqual([
      { level: 'info', message: 'first', timestamp: 1 },
      { level: 'success', message: 'second', timestamp: 2 },
    ]);
  });

  it('trims the oldest entries once the max is exceeded', () => {
    let entries: RunnerLogEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries = appendLogEntry(entries, 'info', `entry-${i}`, i, 3);
    }
    expect(entries).toHaveLength(3);
    expect(entries.map(e => e.message)).toEqual(['entry-2', 'entry-3', 'entry-4']);
  });

  it('defaults to a timestamp near now and a max of 500 when not specified', () => {
    const before = Date.now();
    const result = appendLogEntry([], 'info', 'hi');
    const after = Date.now();
    expect(result[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(result[0].timestamp).toBeLessThanOrEqual(after);
    expect(MAX_CONSOLE_LOG_ENTRIES).toBe(500);
  });
});
