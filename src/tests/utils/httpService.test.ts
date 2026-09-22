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

describe('HttpService.replaceVariables', () => {
  it('resolves plain variables and leaves unresolved placeholders untouched', () => {
    const environment = makeEnvironment({ name: 'world' });
    expect(HttpService.replaceVariables('hello {{name}}', environment)).toBe('hello world');
    expect(HttpService.replaceVariables('hello {{missing}}', environment)).toBe('hello {{missing}}');
  });
});
