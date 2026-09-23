import { describe, it, expect, vi } from 'vitest';
import { executeSingleRequest } from '../../utils/requestExecutor';
import { ApiRequest, Environment } from '../../types';

function makeTransport(respond: (url: string) => { status: number; data: any } = () => ({ status: 200, data: { ok: true } })) {
  return vi.fn(async (config: any) => {
    const { status, data } = respond(config.url);
    return { success: true, response: { status, statusText: status < 400 ? 'OK' : 'Error', headers: {}, data, time: 1, size: 1 } };
  });
}

describe('executeSingleRequest', () => {
  it('substitutes environment variables into the resolved URL', async () => {
    const request: ApiRequest = { id: 'r1', name: 'Echo', method: 'GET', url: '{{baseUrl}}/echo', headers: {} };
    const environment: Environment = { id: 'e1', name: 'Test', variables: { baseUrl: 'http://example.com' } };
    const transport = makeTransport();

    const result = await executeSingleRequest(request, environment, [], null, transport);

    expect(result.resolved.url).toBe('http://example.com/echo');
    expect(result.response.status).toBe(200);
  });

  it('runs without throwing when environment is null, with no variables to substitute', async () => {
    const request: ApiRequest = { id: 'r1', name: 'Plain', method: 'GET', url: 'http://example.com/plain', headers: {} };
    const transport = makeTransport();

    const result = await executeSingleRequest(request, null, [], null, transport);

    expect(result.resolved.url).toBe('http://example.com/plain');
    expect(result.variables).toEqual({});
  });

  it('a preRequestScript that sets a variable affects the resolved URL', async () => {
    const request: ApiRequest = {
      id: 'r1', name: 'Echo', method: 'GET', url: '{{baseUrl}}/{{path}}', headers: {},
      preRequestScript: `pm.environment.set('path', 'from-script');`,
    };
    const environment: Environment = { id: 'e1', name: 'Test', variables: { baseUrl: 'http://example.com' } };
    const transport = makeTransport();

    const result = await executeSingleRequest(request, environment, [], null, transport);

    expect(result.resolved.url).toBe('http://example.com/from-script');
    expect(result.variables.path).toBe('from-script');
  });

  it('a testScript that reads the response and sets a variable is reflected in the returned variables', async () => {
    const request: ApiRequest = {
      id: 'r1', name: 'Echo', method: 'GET', url: 'http://example.com/echo', headers: {},
      testScript: `pm.environment.set('status', String(pm.response.status));`,
    };
    const transport = makeTransport(() => ({ status: 201, data: {} }));

    const result = await executeSingleRequest(request, null, [], null, transport);

    expect(result.variables.status).toBe('201');
  });

  it('collects console.log output from both scripts in order', async () => {
    const request: ApiRequest = {
      id: 'r1', name: 'Echo', method: 'GET', url: 'http://example.com/echo', headers: {},
      preRequestScript: `console.log('pre');`,
      testScript: `console.log('test');`,
    };
    const transport = makeTransport();

    const result = await executeSingleRequest(request, null, [], null, transport);

    expect(result.scriptLogs).toEqual(['pre', 'test']);
  });
});
