import { describe, it, expect } from 'vitest';
import { exportPostmanCollection, exportPostmanEnvironment } from '../../utils/postmanExporter';
import { importPostmanCollection, importPostmanEnvironment } from '../../utils/postmanImporter';
import { Collection, Environment } from '../../types';

describe('exportPostmanCollection', () => {
  it('exports a top-level request with headers, JSON body, bearer auth, and scripts', () => {
    const collection: Collection = {
      id: '1',
      name: 'My Collection',
      requests: [
        {
          id: 'r1',
          name: 'Get User',
          method: 'GET',
          url: 'https://api.example.com/users/{{userId}}',
          headers: { Accept: 'application/json' },
          body: { type: 'raw', rawSubtype: 'json', data: '{"foo":"bar"}' },
          auth: { type: 'bearer', bearer: '{{token}}' },
          preRequestScript: 'console.log("pre")',
          testScript: 'pm.test("ok", () => {});',
        },
      ],
    };

    const exported = exportPostmanCollection(collection);

    expect(exported.info.name).toBe('My Collection');
    expect(exported.info.schema).toContain('v2.1.0');
    expect(exported.item).toHaveLength(1);

    const item = exported.item[0];
    expect(item.name).toBe('Get User');
    expect(item.request.method).toBe('GET');
    expect(item.request.url.raw).toBe('https://api.example.com/users/{{userId}}');
    expect(item.request.header).toEqual([{ key: 'Accept', value: 'application/json' }]);
    expect(item.request.body.mode).toBe('raw');
    expect(item.request.body.raw).toBe('{"foo":"bar"}');
    expect(item.request.body.options.raw.language).toBe('json');
    expect(item.request.auth).toEqual({ type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] });
    expect(item.event).toEqual([
      { listen: 'prerequest', script: { type: 'text/javascript', exec: ['console.log("pre")'] } },
      { listen: 'test', script: { type: 'text/javascript', exec: ['pm.test("ok", () => {});'] } },
    ]);
  });

  it('exports folders as nested Postman items', () => {
    const collection: Collection = {
      id: '1',
      name: 'Coll',
      requests: [],
      folders: [
        {
          id: 'f1',
          name: 'Users',
          requests: [
            { id: 'r1', name: 'List', method: 'GET', url: 'https://api.example.com/users', headers: {} },
          ],
        },
      ],
    };

    const exported = exportPostmanCollection(collection);
    expect(exported.item).toHaveLength(1);
    expect(exported.item[0].name).toBe('Users');
    expect(exported.item[0].item).toHaveLength(1);
    expect(exported.item[0].item[0].name).toBe('List');
  });

  it('exports a sub-folder nested inside a folder as a nested Postman item', () => {
    const collection: Collection = {
      id: '1',
      name: 'Coll',
      requests: [],
      folders: [
        {
          id: 'f1',
          name: 'Users',
          requests: [{ id: 'r1', name: 'List', method: 'GET', url: 'https://api.example.com/users', headers: {} }],
          folders: [
            {
              id: 'f2',
              name: 'Admin',
              requests: [{ id: 'r2', name: 'Ban', method: 'POST', url: 'https://api.example.com/ban', headers: {} }],
            },
          ],
        },
      ],
    };

    const exported = exportPostmanCollection(collection);
    const usersItem = exported.item[0];
    expect(usersItem.name).toBe('Users');
    // Users item[] contains its own request AND the nested Admin folder
    expect(usersItem.item).toHaveLength(2);
    expect(usersItem.item[0].name).toBe('List');
    const adminItem = usersItem.item[1];
    expect(adminItem.name).toBe('Admin');
    expect(adminItem.item).toHaveLength(1);
    expect(adminItem.item[0].name).toBe('Ban');
  });

  it('round-trips nested folders through importPostmanCollection', () => {
    const collection: Collection = {
      id: '1',
      name: 'Coll',
      requests: [],
      folders: [
        {
          id: 'f1',
          name: 'Users',
          requests: [],
          folders: [
            {
              id: 'f2',
              name: 'Admin',
              requests: [{ id: 'r2', name: 'Ban', method: 'POST', url: 'https://api.example.com/ban', headers: {} }],
            },
          ],
        },
      ],
    };

    const exported = exportPostmanCollection(collection);
    const reimported = importPostmanCollection(JSON.stringify(exported));

    const usersFolder = reimported.collection.folders![0];
    expect(usersFolder.name).toBe('Users');
    expect(usersFolder.folders).toHaveLength(1);
    expect(usersFolder.folders![0].name).toBe('Admin');
    expect(usersFolder.folders![0].requests.map(r => r.name)).toEqual(['Ban']);
  });

  it('maps basic auth and omits auth for "none" and "inherit"', () => {
    const basicRequest: Collection = {
      id: '1', name: 'C', requests: [
        { id: 'r1', name: 'A', method: 'GET', url: 'https://x.com', headers: {}, auth: { type: 'basic', basic: { username: 'u', password: 'p' } } },
        { id: 'r2', name: 'B', method: 'GET', url: 'https://x.com', headers: {}, auth: { type: 'none' } },
        { id: 'r3', name: 'C', method: 'GET', url: 'https://x.com', headers: {}, auth: { type: 'inherit' } },
      ],
    };

    const exported = exportPostmanCollection(basicRequest);
    expect(exported.item[0].request.auth).toEqual({
      type: 'basic',
      basic: [
        { key: 'username', value: 'u', type: 'string' },
        { key: 'password', value: 'p', type: 'string' },
      ],
    });
    expect(exported.item[1].request.auth).toEqual({ type: 'noauth' });
    expect(exported.item[2].request.auth).toBeUndefined();
  });

  it('round-trips through importPostmanCollection', () => {
    const collection: Collection = {
      id: '1',
      name: 'Round Trip',
      requests: [
        {
          id: 'r1',
          name: 'Create',
          method: 'POST',
          url: 'https://api.example.com/items',
          headers: { 'X-Custom': 'value' },
          body: { type: 'raw', rawSubtype: 'json', data: '{"a":1}' },
          auth: { type: 'bearer', bearer: 'abc123' },
        },
      ],
    };

    const exported = exportPostmanCollection(collection);
    const reimported = importPostmanCollection(JSON.stringify(exported));

    expect(reimported.collection.name).toBe('Round Trip');
    expect(reimported.collection.requests).toHaveLength(1);
    const request = reimported.collection.requests[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.example.com/items');
    expect(request.headers['X-Custom']).toBe('value');
    expect(request.body).toEqual({ type: 'raw', rawSubtype: 'json', data: '{"a":1}' });
    expect(request.auth).toEqual({ type: 'bearer', bearer: 'abc123' });
  });

  it('exports collection.variablesArray as a top-level Postman variable[] array', () => {
    const collection: Collection = {
      id: '1',
      name: 'With Variables',
      requests: [],
      variablesArray: [
        { key: 'apiBase', value: 'https://api.example.com', isSecret: false },
        { key: 'authToken', value: 'super-secret', isSecret: true },
      ],
    };

    const exported = exportPostmanCollection(collection);

    expect(exported.variable).toEqual([
      { key: 'apiBase', value: 'https://api.example.com', type: 'string' },
      { key: 'authToken', value: 'super-secret', type: 'string' },
    ]);
  });

  it('omits the variable array entirely when there are no collection variables', () => {
    const collection: Collection = { id: '1', name: 'No Variables', requests: [] };
    expect(exportPostmanCollection(collection).variable).toBeUndefined();
  });

  it('round-trips collection variables through importPostmanCollection into collection.variablesArray', () => {
    const collection: Collection = {
      id: '1',
      name: 'Round Trip Vars',
      requests: [],
      variablesArray: [{ key: 'apiBase', value: 'https://api.example.com', isSecret: false }],
    };

    const exported = exportPostmanCollection(collection);
    const reimported = importPostmanCollection(JSON.stringify(exported));

    expect(reimported.collection.variablesArray).toEqual([
      { key: 'apiBase', value: 'https://api.example.com', isSecret: false },
    ]);
    expect(reimported.collection.variables).toEqual({ apiBase: 'https://api.example.com' });
  });
});

describe('exportPostmanEnvironment', () => {
  it('marks secret variables with type "secret" and others as "default"', () => {
    const environment: Environment = {
      id: 'e1',
      name: 'Staging',
      variables: { apiBase: 'https://staging.example.com', token: 'shh' },
      variablesArray: [
        { key: 'apiBase', value: 'https://staging.example.com', isSecret: false },
        { key: 'token', value: 'shh', isSecret: true },
      ],
    };

    const exported = exportPostmanEnvironment(environment);

    expect(exported.name).toBe('Staging');
    expect(exported.values).toEqual([
      { key: 'apiBase', value: 'https://staging.example.com', type: 'default', enabled: true },
      { key: 'token', value: 'shh', type: 'secret', enabled: true },
    ]);
  });

  it('falls back to the legacy `variables` map when `variablesArray` is absent', () => {
    const environment: Environment = {
      id: 'e1',
      name: 'Legacy',
      variables: { host: 'example.com' },
    };

    const exported = exportPostmanEnvironment(environment);
    expect(exported.values).toEqual([{ key: 'host', value: 'example.com', type: 'default', enabled: true }]);
  });

  it('round-trips through importPostmanEnvironment', () => {
    const environment: Environment = {
      id: 'e1',
      name: 'Prod',
      variables: { token: 'abc' },
      variablesArray: [{ key: 'token', value: 'abc', isSecret: true }],
    };

    const exported = exportPostmanEnvironment(environment);
    const reimported = importPostmanEnvironment(JSON.stringify(exported));

    expect(reimported.environment.name).toBe('Prod');
    expect(reimported.environment.variablesArray).toEqual([{ key: 'token', value: 'abc', isSecret: true }]);
  });
});
