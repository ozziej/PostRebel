import { describe, it, expect } from 'vitest';
import { importOpenApi } from '../../utils/openApiImporter';

function findRequest(collection: ReturnType<typeof importOpenApi>['collection'], name: string) {
  const request = collection.requests.find((r) => r.name === name)
    ?? collection.folders?.flatMap((f) => f.requests).find((r) => r.name === name);
  if (!request) throw new Error(`Request "${name}" not found in collection`);
  return request;
}

describe('importOpenApi - request body generation', () => {
  it('includes a nested $ref body (e.g. VoucherProvisionRequest -> UserDetail -> Address)', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      servers: [{ url: 'http://localhost:8080' }],
      paths: {
        '/api/voucher/provision': {
          post: {
            operationId: 'provisionVoucher',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VoucherProvisionRequest' },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          VoucherProvisionRequest: {
            type: 'object',
            properties: {
              voucherCode: { type: 'string' },
              amount: { type: 'number' },
              user: { $ref: '#/components/schemas/UserDetail' },
            },
          },
          UserDetail: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              address: { $ref: '#/components/schemas/Address' },
            },
          },
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'provisionVoucher');

    expect(request.body).toBeDefined();
    const data = JSON.parse((request.body as any).data);
    expect(data).toEqual({
      voucherCode: 'string',
      amount: 0,
      user: {
        userId: 'string',
        address: {
          street: 'string',
          city: 'string',
        },
      },
    });
  });

  it('merges all allOf members instead of only the first', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      paths: {
        '/things': {
          post: {
            operationId: 'createThing',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateThingRequest' },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          CreateThingRequest: {
            allOf: [
              { $ref: '#/components/schemas/BaseThing' },
              {
                type: 'object',
                properties: {
                  extra: { type: 'string' },
                },
              },
            ],
          },
          BaseThing: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'createThing');

    const data = JSON.parse((request.body as any).data);
    expect(data).toEqual({ id: 'string', extra: 'string' });
  });

  it('does not infinitely recurse on a self-referencing schema', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      paths: {
        '/nodes': {
          post: {
            operationId: 'createNode',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Node' },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              parent: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    };

    expect(() => importOpenApi(JSON.stringify(spec))).not.toThrow();

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'createNode');
    const data = JSON.parse((request.body as any).data);
    expect(data.name).toBe('string');
    expect(data.parent).toBeDefined();
  });

  it('generates a body for Swagger 2.0 "in: body" params with a $ref schema', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Test API' },
      host: 'localhost:8080',
      basePath: '/',
      paths: {
        '/legacy/provision': {
          post: {
            operationId: 'provisionLegacy',
            parameters: [
              {
                in: 'body',
                name: 'body',
                schema: { $ref: '#/definitions/LegacyRequest' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      definitions: {
        LegacyRequest: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            detail: { $ref: '#/definitions/LegacyDetail' },
          },
        },
        LegacyDetail: {
          type: 'object',
          properties: {
            note: { type: 'string' },
          },
        },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'provisionLegacy');

    expect(request.body).toBeDefined();
    const data = JSON.parse((request.body as any).data);
    expect(data).toEqual({ code: 'string', detail: { note: 'string' } });
  });

  it('includes required header parameters (e.g. cifNo, userReg)', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      paths: {
        '/api/voucher/provision': {
          post: {
            operationId: 'provisionVoucher',
            parameters: [
              { in: 'header', name: 'cifNo', required: true, schema: { type: 'string' } },
              { in: 'header', name: 'userReg', required: true, schema: { type: 'string' } },
              { in: 'header', name: 'optionalTrace', required: false, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'provisionVoucher');

    expect(request.headers.cifNo).toBe('{{cifNo}}');
    expect(request.headers.userReg).toBe('{{userReg}}');
    expect(request.headers.optionalTrace).toBeUndefined();
  });
});

describe('importOpenApi - oauth2 security schemes', () => {
  it('maps an OpenAPI 3 clientCredentials flow to a real oauth2 auth config', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      servers: [{ url: 'http://localhost:8080' }],
      components: {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: { clientCredentials: { tokenUrl: 'https://auth.example.com/token', scopes: { read: 'Read access' } } },
          },
        },
      },
      security: [{ oauth2: [] }],
      paths: {
        '/things': { get: { operationId: 'listThings', responses: { '200': { description: 'OK' } } } },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'listThings');
    expect(request.auth).toEqual({
      type: 'oauth2',
      oauth2: { grantType: 'client_credentials', accessTokenUrl: 'https://auth.example.com/token', scope: 'read' },
    });
  });

  it('maps a Swagger 2.0 application flow to a client_credentials oauth2 auth config', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Test API' },
      host: 'api.example.com',
      basePath: '/',
      securityDefinitions: {
        oauth2: { type: 'oauth2', flow: 'application', tokenUrl: 'https://auth.example.com/token', scopes: {} },
      },
      security: [{ oauth2: [] }],
      paths: {
        '/things': { get: { operationId: 'listThings', responses: { '200': { description: 'OK' } } } },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'listThings');
    expect(request.auth).toEqual({
      type: 'oauth2',
      oauth2: { grantType: 'client_credentials', accessTokenUrl: 'https://auth.example.com/token', scope: '' },
    });
  });

  it('falls back to an empty bearer stub for an implicit-only flow (no token endpoint to call headlessly)', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 'Test API' },
      servers: [{ url: 'http://localhost:8080' }],
      components: {
        securitySchemes: {
          oauth2: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'https://auth.example.com/authorize', scopes: {} } } },
        },
      },
      security: [{ oauth2: [] }],
      paths: {
        '/things': { get: { operationId: 'listThings', responses: { '200': { description: 'OK' } } } },
      },
    };

    const result = importOpenApi(JSON.stringify(spec));
    const request = findRequest(result.collection, 'listThings');
    expect(request.auth).toEqual({ type: 'bearer', bearer: '' });
  });
});
