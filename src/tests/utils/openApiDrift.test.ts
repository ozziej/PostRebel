import { describe, it, expect } from 'vitest';
import { computeOpenApiDrift, applyOpenApiDrift, extractPathname } from '../../utils/openApiDrift';
import { Collection, ApiRequest } from '../../types';

function req(overrides: Partial<ApiRequest> & { id: string; method: ApiRequest['method']; url: string }): ApiRequest {
  return { name: overrides.id, headers: {}, ...overrides };
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return { id: 'c1', name: 'API', requests: [], ...overrides };
}

describe('extractPathname', () => {
  it('strips scheme/host and query string', () => {
    expect(extractPathname('https://api.example.com/v1/users/{{id}}?x=1')).toBe('/v1/users/{{id}}');
  });

  it('falls back to the raw string when the URL has no scheme (relative)', () => {
    expect(extractPathname('/users/{{id}}')).toBe('/users/{{id}}');
  });
});

describe('computeOpenApiDrift', () => {
  it('reports a new endpoint as added', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/users' })] });
    const imported = collection({
      requests: [
        req({ id: 'new1', method: 'GET', url: 'https://api.example.com/users' }),
        req({ id: 'new2', method: 'POST', url: 'https://api.example.com/users' }),
      ],
    });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.added).toHaveLength(1);
    expect(drift.added[0].method).toBe('POST');
    expect(drift.added[0].path).toBe('/users');
    expect(drift.changed).toHaveLength(0);
    expect(drift.unchangedCount).toBe(1);
  });

  it('reports an endpoint no longer in the spec as removed', () => {
    const existing = collection({
      requests: [
        req({ id: 'r1', method: 'GET', url: 'https://api.example.com/users' }),
        req({ id: 'r2', method: 'DELETE', url: 'https://api.example.com/users/{{id}}' }),
      ],
    });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/users' })] });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.removed).toHaveLength(1);
    expect(drift.removed[0].method).toBe('DELETE');
    expect(drift.removed[0].existingRequestId).toBe('r2');
  });

  it('treats identical endpoints (ignoring host) as unchanged', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://old-host.example.com/users' })] });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://new-host.example.com/users' })] });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.added).toHaveLength(0);
    expect(drift.removed).toHaveLength(0);
    expect(drift.changed).toHaveLength(0);
    expect(drift.unchangedCount).toBe(1);
  });

  it('detects an auth type change', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/me', auth: { type: 'none' } })] });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/me', auth: { type: 'bearer', bearer: '' } })] });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.changed).toHaveLength(1);
    expect(drift.changed[0].changes).toEqual([{ field: 'auth', before: 'none', after: 'bearer' }]);
    expect(drift.changed[0].existingRequestId).toBe('r1');
  });

  it('detects a required-header addition', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/me', headers: {} })] });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/me', headers: { 'X-Api-Key': '{{apiKey}}' } })] });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.changed[0].changes).toEqual([{ field: 'headers', before: '(none)', after: 'X-Api-Key' }]);
  });

  it('detects a body being added, ignoring Content-Type in the headers diff', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'POST', url: 'https://api.example.com/users', headers: {} })] });
    const imported = collection({
      requests: [req({
        id: 'new1', method: 'POST', url: 'https://api.example.com/users',
        headers: { 'Content-Type': 'application/json' },
        body: { type: 'raw', rawSubtype: 'json', data: '{}' },
      })],
    });

    const drift = computeOpenApiDrift(existing, imported);
    const fields = drift.changed[0].changes!.map(c => c.field);
    expect(fields).toContain('body');
    expect(fields).toContain('content-type');
    expect(fields).not.toContain('headers');
  });

  it('detects a required query param change', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/search' })] });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/search?q={{q}}' })] });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.changed[0].changes).toEqual([{ field: 'query params', before: '(none)', after: 'q' }]);
  });

  it('detects a folder (tag) change', () => {
    const existing = collection({
      folders: [{ id: 'f1', name: 'Legacy', requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/users' })] }],
      requests: [],
    });
    const imported = collection({
      folders: [{ id: 'f2', name: 'Users', requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/users' })] }],
      requests: [],
    });

    const drift = computeOpenApiDrift(existing, imported);
    expect(drift.changed[0].changes).toEqual([{ field: 'folder', before: 'Legacy', after: 'Users' }]);
    expect(drift.changed[0].tag).toBe('Users');
  });
});

describe('applyOpenApiDrift', () => {
  it('adds new endpoints under their tag, creating the folder if needed', () => {
    const existing = collection({ requests: [] });
    const drift = computeOpenApiDrift(existing, collection({
      folders: [{ id: 'f1', name: 'Users', requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/users' })] }],
      requests: [],
    }));

    const result = applyOpenApiDrift(existing, drift);
    expect(result.folders).toHaveLength(1);
    expect(result.folders![0].name).toBe('Users');
    expect(result.folders![0].requests[0].id).toBe('new1');
  });

  it('updates a changed endpoint in place, preserving its original id', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/me', auth: { type: 'none' } })] });
    const imported = collection({ requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/me', auth: { type: 'bearer', bearer: '' } })] });
    const drift = computeOpenApiDrift(existing, imported);

    const result = applyOpenApiDrift(existing, drift);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0].id).toBe('r1');
    expect(result.requests[0].auth).toEqual({ type: 'bearer', bearer: '' });
  });

  it('moves a changed endpoint to its new folder when the tag changed', () => {
    const existing = collection({
      folders: [{ id: 'f1', name: 'Legacy', requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/users' })] }],
      requests: [],
    });
    const imported = collection({
      folders: [{ id: 'f2', name: 'Users', requests: [req({ id: 'new1', method: 'GET', url: 'https://api.example.com/users' })] }],
      requests: [],
    });
    const drift = computeOpenApiDrift(existing, imported);

    const result = applyOpenApiDrift(existing, drift);
    const legacy = result.folders!.find(f => f.name === 'Legacy')!;
    const users = result.folders!.find(f => f.name === 'Users')!;
    expect(legacy.requests).toHaveLength(0);
    expect(users.requests).toHaveLength(1);
    expect(users.requests[0].id).toBe('r1');
  });

  it('leaves a removed endpoint alone by default', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'DELETE', url: 'https://api.example.com/users/{{id}}' })] });
    const drift = computeOpenApiDrift(existing, collection({ requests: [] }));

    const result = applyOpenApiDrift(existing, drift);
    expect(result.requests).toHaveLength(1);
  });

  it('deletes a removed endpoint only when its key is in removeKeys', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'DELETE', url: 'https://api.example.com/users/{{id}}' })] });
    const drift = computeOpenApiDrift(existing, collection({ requests: [] }));

    const result = applyOpenApiDrift(existing, drift, new Set([drift.removed[0].key]));
    expect(result.requests).toHaveLength(0);
  });

  it('does not mutate the original collection', () => {
    const existing = collection({ requests: [req({ id: 'r1', method: 'GET', url: 'https://api.example.com/users' })] });
    const drift = computeOpenApiDrift(existing, collection({
      requests: [req({ id: 'new1', method: 'POST', url: 'https://api.example.com/users' })],
    }));

    applyOpenApiDrift(existing, drift);
    expect(existing.requests).toHaveLength(1);
  });
});
