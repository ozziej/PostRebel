import { RunnerLogEntry } from '../types';

export const MAX_CONSOLE_LOG_ENTRIES = 500;

/**
 * Appends a log entry to a persistent, app-wide console log, trimming the
 * oldest entries once `max` is exceeded so the log can't grow unbounded
 * over a long session.
 */
export function appendLogEntry(
  entries: RunnerLogEntry[],
  level: RunnerLogEntry['level'],
  message: string,
  timestamp: number = Date.now(),
  max: number = MAX_CONSOLE_LOG_ENTRIES,
): RunnerLogEntry[] {
  const next = [...entries, { level, message, timestamp }];
  return next.length > max ? next.slice(next.length - max) : next;
}
