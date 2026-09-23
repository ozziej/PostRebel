import { describe, it, expect } from 'vitest';
import { formatJson, formatJUnit, formatText, CliRunResult } from '../reporters';
import { RunnerNode } from '../../src/types';

function makeResult(overrides: Partial<CliRunResult> = {}): CliRunResult {
  return {
    runner: { id: 'run1', name: 'Smoke Test' },
    collection: { id: 'c1', name: 'Demo' },
    environment: 'Local',
    status: 'success',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    nodeResults: {},
    logs: [{ level: 'info', message: '▶ Runner started' }],
    ...overrides,
  };
}

const NODES: RunnerNode[] = [
  { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
  { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Get Widget' } },
  { id: 'req2', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Delete Widget' } },
  { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
];

describe('formatJson', () => {
  it('round-trips the result as pretty JSON', () => {
    const result = makeResult();
    const parsed = JSON.parse(formatJson(result));
    expect(parsed.runner.name).toBe('Smoke Test');
    expect(parsed.status).toBe('success');
  });
});

describe('formatText', () => {
  it('lists log lines followed by a status summary', () => {
    const text = formatText(makeResult());
    expect(text).toContain('▶ Runner started');
    expect(text).toContain('✓ Run success (1000ms)');
  });

  it('marks a failed run with a cross', () => {
    const text = formatText(makeResult({ status: 'error' }));
    expect(text).toContain('✗ Run error');
  });
});

describe('formatJUnit', () => {
  it('only emits testcases for request/retry nodes, skipping start/end', () => {
    const result = makeResult({
      nodeResults: {
        req1: { nodeId: 'req1', status: 'success', response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 42, size: 2 } },
        req2: { nodeId: 'req2', status: 'success', response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 8, size: 2 } },
      },
    });
    const xml = formatJUnit(result, NODES);
    expect(xml).toContain('<testsuite name="Smoke Test" tests="2" failures="0" skipped="0"');
    expect(xml).toContain('name="Get Widget"');
    expect(xml).toContain('name="Delete Widget"');
    expect(xml).not.toContain('name="Start"');
    expect(xml).not.toContain('name="End"');
  });

  it('emits a <failure> element with the error message for a failed node', () => {
    const result = makeResult({
      status: 'error',
      nodeResults: {
        req1: { nodeId: 'req1', status: 'error', error: 'Request not found in collection' },
        req2: { nodeId: 'req2', status: 'idle' } as any,
      },
    });
    const xml = formatJUnit(result, NODES);
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('skipped="1"');
    expect(xml).toContain('<failure message="Request not found in collection">');
  });

  it('escapes XML-unsafe characters in names and messages', () => {
    const nodes: RunnerNode[] = [
      { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'A & B <test>' } },
    ];
    const result = makeResult({
      status: 'error',
      nodeResults: { req1: { nodeId: 'req1', status: 'error', error: '<bad> & "quoted"' } },
    });
    const xml = formatJUnit(result, nodes);
    expect(xml).toContain('name="A &amp; B &lt;test&gt;"');
    expect(xml).toContain('&lt;bad&gt; &amp; &quot;quoted&quot;');
  });
});
