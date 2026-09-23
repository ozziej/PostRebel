import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpService } from '../../utils/httpService';
import { Environment } from '../../types';

function makeEnvironment(variables: Record<string, string> = {}): Environment {
  return { id: 'e1', name: 'Test', variables };
}

describe('HttpService.executeRequest - onResolved callback', () => {
  beforeEach(() => {
    (globalThis as any).window = { electronAPI: { executeHttpRequest: vi.fn() } };
  });

  it('calls onResolved with the fully resolved method/url/headers before making the HTTP call', async () => {
    (globalThis as any).window.electronAPI.executeHttpRequest = vi.fn().mockResolvedValue({
      success: true,
      response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 1, size: 1 },
    });

    const onResolved = vi.fn();
    const environment = makeEnvironment({ host: 'api.example.com', token: 'abc123' });

    await HttpService.executeRequest(
      {
        id: 'r1',
        name: 'Get Widget',
        method: 'GET',
        url: 'https://{{host}}/widgets',
        headers: { Authorization: 'Bearer {{token}}' },
      },
      environment,
      [],
      null,
      onResolved
    );

    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/widgets',
      headers: { Authorization: 'Bearer abc123' },
    });
  });

  it('reflects auth-derived headers too, not just the request-defined ones', async () => {
    (globalThis as any).window.electronAPI.executeHttpRequest = vi.fn().mockResolvedValue({
      success: true,
      response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 1, size: 1 },
    });

    const onResolved = vi.fn();
    const environment = makeEnvironment({ token: 'xyz' });

    await HttpService.executeRequest(
      {
        id: 'r1',
        name: 'Get Widget',
        method: 'GET',
        url: 'https://api.example.com/widgets',
        headers: {},
        auth: { type: 'bearer', bearer: '{{token}}' },
      },
      environment,
      [],
      null,
      onResolved
    );

    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer xyz' }),
    }));
  });
});

describe('HttpService.executeRequest - graphql body', () => {
  function captureConfig(): { transport: any; getConfig: () => any } {
    let captured: any;
    const transport = vi.fn(async (config: any) => {
      captured = config;
      return { success: true, response: { status: 200, statusText: 'OK', headers: {}, data: {}, time: 1, size: 1 } };
    });
    return { transport, getConfig: () => captured };
  }

  it('serializes query + variables into a single JSON body, substituting variables in both', async () => {
    const { transport, getConfig } = captureConfig();
    const environment = makeEnvironment({ postId: '42' });

    await HttpService.executeRequest(
      {
        id: 'r1', name: 'GraphQL', method: 'POST', url: 'https://api.example.com/graphql', headers: {},
        body: { type: 'graphql', data: '', graphql: { query: 'query { post(id: "{{postId}}") { id } }', variables: '{"id": "{{postId}}"}' } },
      },
      environment, [], null, undefined, transport,
    );

    expect(JSON.parse(getConfig().data)).toEqual({
      query: 'query { post(id: "42") { id } }',
      variables: { id: '42' },
    });
    expect(getConfig().headers['Content-Type']).toBe('application/json');
  });

  it('omits variables entirely when the variables field is blank', async () => {
    const { transport, getConfig } = captureConfig();
    await HttpService.executeRequest(
      {
        id: 'r1', name: 'GraphQL', method: 'POST', url: 'https://api.example.com/graphql', headers: {},
        body: { type: 'graphql', data: '', graphql: { query: '{ posts { id } }', variables: '' } },
      },
      makeEnvironment(), [], null, undefined, transport,
    );
    expect(JSON.parse(getConfig().data)).toEqual({ query: '{ posts { id } }' });
  });

  it('falls back to sending no variables when the variables field is not valid JSON', async () => {
    const { transport, getConfig } = captureConfig();
    await HttpService.executeRequest(
      {
        id: 'r1', name: 'GraphQL', method: 'POST', url: 'https://api.example.com/graphql', headers: {},
        body: { type: 'graphql', data: '', graphql: { query: '{ posts { id } }', variables: '{not valid' } },
      },
      makeEnvironment(), [], null, undefined, transport,
    );
    expect(JSON.parse(getConfig().data)).toEqual({ query: '{ posts { id } }' });
  });

  it('includes operationName when set', async () => {
    const { transport, getConfig } = captureConfig();
    await HttpService.executeRequest(
      {
        id: 'r1', name: 'GraphQL', method: 'POST', url: 'https://api.example.com/graphql', headers: {},
        body: { type: 'graphql', data: '', graphql: { query: 'query A { a } query B { b }', variables: '', operationName: 'A' } },
      },
      makeEnvironment(), [], null, undefined, transport,
    );
    expect(JSON.parse(getConfig().data).operationName).toBe('A');
  });

  it('does not overwrite an explicit Content-Type header', async () => {
    const { transport, getConfig } = captureConfig();
    await HttpService.executeRequest(
      {
        id: 'r1', name: 'GraphQL', method: 'POST', url: 'https://api.example.com/graphql', headers: { 'Content-Type': 'application/graphql+json' },
        body: { type: 'graphql', data: '', graphql: { query: '{ posts { id } }', variables: '' } },
      },
      makeEnvironment(), [], null, undefined, transport,
    );
    expect(getConfig().headers['Content-Type']).toBe('application/graphql+json');
  });
});

describe('HttpService.replaceVariables', () => {
  it('resolves plain variables and leaves unresolved placeholders untouched', () => {
    const environment = makeEnvironment({ name: 'world' });
    expect(HttpService.replaceVariables('hello {{name}}', environment)).toBe('hello world');
    expect(HttpService.replaceVariables('hello {{missing}}', environment)).toBe('hello {{missing}}');
  });
});
