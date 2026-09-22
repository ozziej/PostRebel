import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptRunner } from '../../utils/scriptRunner';
import { ApiResponse, Collection, Environment } from '../../types';

function makeEnvironment(variables: Record<string, string> = {}): Environment {
  return { id: 'e1', name: 'Test', variables: { ...variables } };
}

function makeResponse(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { ok: true },
    time: 5,
    size: 10,
    ...overrides,
  };
}

describe('ScriptRunner - pm.environment / pm.test / pm.expect (existing behaviour)', () => {
  it('reads and writes environment variables', async () => {
    const environment = makeEnvironment({ existing: 'value' });
    const result = await ScriptRunner.executePreRequestScript(
      `pm.environment.set('token', pm.environment.get('existing') + '-token');`,
      environment
    );
    expect(result.success).toBe(true);
    expect(environment.variables.token).toBe('value-token');
  });

  it('runs pm.test/pm.expect against the response', async () => {
    const environment = makeEnvironment();
    const response = makeResponse({ status: 201 });
    const result = await ScriptRunner.executeTestScript(
      `pm.test('status is 201', () => { pm.expect(pm.response.status).to.equal(201); });`,
      response,
      environment
    );
    expect(result.success).toBe(true);
    expect(result.testResults).toEqual([{ name: 'status is 201', passed: true }]);
  });
});

describe('ScriptRunner - pm.collectionVariables', () => {
  it('reads and writes variables on the passed-in collection', async () => {
    const collection: Collection = { id: 'c1', name: 'Coll', requests: [] };
    const environment = makeEnvironment();

    const result = await ScriptRunner.executePreRequestScript(
      `pm.collectionVariables.set('apiBase', 'https://api.example.com');`,
      environment,
      { collection }
    );

    expect(result.success).toBe(true);
    expect(collection.variables).toEqual({ apiBase: 'https://api.example.com' });
  });

  it('get() returns an empty string for a missing key or when no collection is provided', async () => {
    const environment = makeEnvironment();
    const result = await ScriptRunner.executePreRequestScript(
      `pm.environment.set('seen', JSON.stringify(pm.collectionVariables.get('missing')));`,
      environment
    );
    expect(result.success).toBe(true);
    expect(environment.variables.seen).toBe('""');
  });

  it('set() is a safe no-op when no collection is provided', async () => {
    const environment = makeEnvironment();
    const result = await ScriptRunner.executePreRequestScript(
      `pm.collectionVariables.set('x', 'y');`,
      environment
    );
    expect(result.success).toBe(true);
  });
});

describe('ScriptRunner - pm.globals', () => {
  it('persists a value across independent script executions', async () => {
    const environmentA = makeEnvironment();
    const environmentB = makeEnvironment();

    await ScriptRunner.executePreRequestScript(`pm.globals.set('shared_pm_globals_test_key', 'hello');`, environmentA);
    const result = await ScriptRunner.executePreRequestScript(
      `pm.environment.set('seen', pm.globals.get('shared_pm_globals_test_key'));`,
      environmentB
    );

    expect(result.success).toBe(true);
    expect(environmentB.variables.seen).toBe('hello');
  });
});

describe('ScriptRunner - pm.sendRequest', () => {
  beforeEach(() => {
    (globalThis as any).window = { electronAPI: { executeHttpRequest: vi.fn() } };
  });

  it('waits for the callback before resolving, and passes a pm-response-shaped object', async () => {
    (globalThis as any).window.electronAPI.executeHttpRequest = vi.fn().mockResolvedValue({
      success: true,
      response: { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, data: { token: 'abc123' }, time: 3, size: 20 },
    });

    const environment = makeEnvironment();
    const result = await ScriptRunner.executePreRequestScript(
      `
      pm.sendRequest('https://auth.example.com/token', (err, res) => {
        pm.environment.set('token', res.json().token);
        pm.environment.set('status', String(res.status));
      });
      `,
      environment
    );

    expect(result.success).toBe(true);
    expect(environment.variables.token).toBe('abc123');
    expect(environment.variables.status).toBe('200');
  });

  it('normalizes an object-form request (method, headers, raw body) into the HTTP call', async () => {
    const executeHttpRequest = vi.fn().mockResolvedValue({
      success: true,
      response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 1, size: 1 },
    });
    (globalThis as any).window.electronAPI.executeHttpRequest = executeHttpRequest;

    const environment = makeEnvironment();
    await ScriptRunner.executePreRequestScript(
      `
      pm.sendRequest({
        url: 'https://api.example.com/widgets',
        method: 'post',
        header: [{ key: 'X-Custom', value: 'abc' }],
        body: { mode: 'raw', raw: '{"a":1}' }
      }, () => {});
      `,
      environment
    );

    expect(executeHttpRequest).toHaveBeenCalledTimes(1);
    const config = executeHttpRequest.mock.calls[0][0];
    expect(config.method).toBe('post');
    expect(config.url).toBe('https://api.example.com/widgets');
    expect(config.headers['X-Custom']).toBe('abc');
    expect(config.data).toBe('{"a":1}');
  });
});
