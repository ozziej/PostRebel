import { describe, it, expect, vi } from 'vitest';
import { executeRunner, executeRunnerForDataRows } from '../../utils/runnerExecutor';
import { Collection, Environment, Runner, RunnerNodeResult } from '../../types';

function makeCollection(): Collection {
  return {
    id: 'c1',
    name: 'Demo',
    requests: [{ id: 'r1', name: 'Echo', method: 'GET', url: '{{baseUrl}}/echo?user={{userId}}', headers: {} }],
  };
}

function makeRunner(): Runner {
  return {
    id: 'run1',
    name: 'Smoke',
    collectionId: 'c1',
    workspaceId: 'ws1',
    createdAt: '',
    updatedAt: '',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Echo', requestId: 'r1' } },
      { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'req1' },
      { id: 'e2', source: 'req1', target: 'end' },
    ],
  };
}

function makeTransport(respond: (url: string) => { status: number; data: any }) {
  return vi.fn(async (config: any) => {
    const { status, data } = respond(config.url);
    return { success: true, response: { status, statusText: status < 400 ? 'OK' : 'Error', headers: {}, data, time: 1, size: 1 } };
  });
}

describe('executeRunner extraVariables precedence', () => {
  it('lets a per-run extraVariables override the environment for URL substitution', async () => {
    const environment: Environment = { id: 'e1', name: 'Test', variables: { baseUrl: 'http://example.com', userId: 'env-user' } };
    const transport = makeTransport(() => ({ status: 200, data: {} }));
    const nodeResults: Record<string, RunnerNodeResult> = {};

    await executeRunner(
      makeRunner(), makeCollection(), environment, [],
      (nodeId, result) => { nodeResults[nodeId] = result; },
      undefined, undefined, undefined, transport,
      { userId: 'row-user' },
    );

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://example.com/echo?user=row-user' }));
    expect(nodeResults.end?.status).toBe('success');
  });

  it('lets extraVariables override a Start-node variable override too, not just the environment', async () => {
    const environment: Environment = { id: 'e1', name: 'Test', variables: { baseUrl: 'http://example.com' } };
    const runner = makeRunner();
    runner.nodes[0].data.variables = [{ key: 'userId', value: 'start-override-user' }];
    const transport = makeTransport(() => ({ status: 200, data: {} }));

    await executeRunner(
      runner, makeCollection(), environment, [],
      () => {}, undefined, undefined, undefined, transport,
      { userId: 'row-user' },
    );

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://example.com/echo?user=row-user' }));
  });
});

describe('executeRunnerForDataRows', () => {
  const environment: Environment = { id: 'e1', name: 'Test', variables: { baseUrl: 'http://example.com' } };

  it('runs the flow once per row with isolated node results, tagging each callback with the row index', async () => {
    const transport = makeTransport(url => ({ status: 200, data: { echoed: url } }));
    const rows = [{ userId: 'alice' }, { userId: 'bob' }];

    const rowStarts: number[] = [];
    const statusesByRow: Record<number, string[]> = {};

    const results = await executeRunnerForDataRows(
      makeRunner(), makeCollection(), environment, [], rows,
      (rowIndex) => rowStarts.push(rowIndex),
      (rowIndex, nodeId) => { (statusesByRow[rowIndex] ||= []).push(nodeId); },
      undefined, undefined, undefined, transport,
    );

    expect(rowStarts).toEqual([0, 1]);
    expect(results).toHaveLength(2);
    expect(results[0].row).toEqual({ userId: 'alice' });
    expect(results[0].nodeResults.req1.response?.data.echoed).toContain('user=alice');
    expect(results[1].row).toEqual({ userId: 'bob' });
    expect(results[1].nodeResults.req1.response?.data.echoed).toContain('user=bob');
    expect(statusesByRow[0]).toContain('req1');
    expect(statusesByRow[1]).toContain('req1');
  });

  it('keeps running subsequent rows after one row fails', async () => {
    const transport = makeTransport(url => (url.includes('user=bad') ? { status: 500, data: {} } : { status: 200, data: {} }));
    const rows = [{ userId: 'bad' }, { userId: 'good' }];

    const results = await executeRunnerForDataRows(
      makeRunner(), makeCollection(), environment, [], rows,
      () => {}, () => {}, undefined, undefined, undefined, transport,
    );

    expect(results).toHaveLength(2);
    expect(results[0].nodeResults.req1.status).toBe('error');
    expect(results[1].nodeResults.req1.status).toBe('success');
  });

  it('stops early once the abort signal fires', async () => {
    const transport = makeTransport(() => ({ status: 200, data: {} }));
    const controller = new AbortController();
    controller.abort();

    const results = await executeRunnerForDataRows(
      makeRunner(), makeCollection(), environment, [], [{ userId: 'a' }, { userId: 'b' }],
      () => {}, () => {}, undefined, undefined, controller.signal, transport,
    );

    expect(results).toHaveLength(0);
  });
});
