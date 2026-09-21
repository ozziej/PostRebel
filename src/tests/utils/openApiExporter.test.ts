import { describe, it, expect } from 'vitest';
import { exportOpenApi } from '../../utils/openApiExporter';
import { importOpenApi } from '../../utils/openApiImporter';
import { Collection } from '../../types';

describe('exportOpenApi', () => {
  it('converts path params, server origin, and a JSON body into an OpenAPI path', () => {
    const collection: Collection = {
      id: '1',
      name: 'Test API',
      requests: [
        {
          id: 'r1',
          name: 'Get User',
          method: 'GET',
          url: 'https://api.example.com/users/{{userId}}',
          headers: {},
        },
        {
          id: 'r2',
          name: 'Create User',
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'Content-Type': 'application/json' },
          body: { type: 'raw', rawSubtype: 'json', data: '{"name":"Jane"}' },
        },
      ],
    };

    const { spec, errors } = exportOpenApi(collection);

    expect(errors).toEqual([]);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Test API');
    expect(spec.servers).toEqual([{ url: 'https://api.example.com' }]);

    const getOp = spec.paths['/users/{userId}'].get;
    expect(getOp.parameters).toEqual([{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }]);

    const postOp = spec.paths['/users'].post;
    expect(postOp.requestBody.content['application/json'].example).toEqual({ name: 'Jane' });
  });

  it('converts required query params into OpenAPI query parameters', () => {
    const collection: Collection = {
      id: '1',
      name: 'API',
      requests: [
        { id: 'r1', name: 'Search', method: 'GET', url: 'https://api.example.com/search?q={{query}}', headers: {} },
      ],
    };

    const { spec } = exportOpenApi(collection);
    expect(spec.paths['/search'].get.parameters).toEqual([
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
    ]);
  });

  it('maps bearer and basic auth to security schemes', () => {
    const collection: Collection = {
      id: '1',
      name: 'API',
      requests: [
        { id: 'r1', name: 'A', method: 'GET', url: 'https://api.example.com/a', headers: {}, auth: { type: 'bearer', bearer: 'tok' } },
        { id: 'r2', name: 'B', method: 'GET', url: 'https://api.example.com/b', headers: {}, auth: { type: 'basic', basic: { username: 'u', password: 'p' } } },
      ],
    };

    const { spec } = exportOpenApi(collection);
    expect(spec.components.securitySchemes.bearerAuth).toEqual({ type: 'http', scheme: 'bearer' });
    expect(spec.components.securitySchemes.basicAuth).toEqual({ type: 'http', scheme: 'basic' });
    expect(spec.paths['/a'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths['/b'].get.security).toEqual([{ basicAuth: [] }]);
  });

  it('groups tagged (folder) requests and untagged (top-level) requests correctly', () => {
    const collection: Collection = {
      id: '1',
      name: 'API',
      requests: [
        { id: 'r1', name: 'Health', method: 'GET', url: 'https://api.example.com/health', headers: {} },
      ],
      folders: [
        {
          id: 'f1',
          name: 'Users',
          requests: [
            { id: 'r2', name: 'List Users', method: 'GET', url: 'https://api.example.com/users', headers: {} },
          ],
        },
      ],
    };

    const { spec } = exportOpenApi(collection);
    expect(spec.paths['/health'].get.tags).toBeUndefined();
    expect(spec.paths['/users'].get.tags).toEqual(['Users']);
  });

  it('round-trips a simple collection through importOpenApi', () => {
    const collection: Collection = {
      id: '1',
      name: 'Round Trip API',
      requests: [
        {
          id: 'r1',
          name: 'getWidget',
          method: 'GET',
          url: 'https://api.example.com/widgets/{{widgetId}}',
          headers: {},
          auth: { type: 'bearer', bearer: '' },
        },
      ],
    };

    const { spec } = exportOpenApi(collection);
    const reimported = importOpenApi(JSON.stringify(spec));

    expect(reimported.collection.requests).toHaveLength(1);
    const request = reimported.collection.requests[0];
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://api.example.com/widgets/{{widgetId}}');
    expect(request.auth).toEqual({ type: 'bearer', bearer: '' });
  });
});
