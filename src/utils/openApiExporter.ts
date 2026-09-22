import { Collection, CollectionFolder, ApiRequest } from '../types';

export interface OpenApiExportResult {
  spec: any;
  errors: string[];
}

// OpenAPI tags are a flat string per operation, unlike PostRebel's nested
// folders — a nested folder's tag becomes its "Parent/Child" path so nesting
// isn't silently lost, even though OpenAPI itself has no folder concept.
function flattenWithTags(folders: CollectionFolder[], prefix: string): Array<{ request: ApiRequest; tag: string }> {
  const result: Array<{ request: ApiRequest; tag: string }> = [];
  for (const folder of folders) {
    const tag = prefix ? `${prefix}/${folder.name}` : folder.name;
    result.push(...folder.requests.map(request => ({ request, tag })));
    result.push(...flattenWithTags(folder.folders || [], tag));
  }
  return result;
}

function splitUrl(url: string): { origin: string; pathAndQuery: string } {
  const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (match) {
    return { origin: match[1], pathAndQuery: match[2] || '/' };
  }
  return { origin: '', pathAndQuery: url.startsWith('/') ? url : `/${url}` };
}

function toOpenApiPath(pathAndQuery: string): { pathname: string; queryParams: string[] } {
  const [pathnameRaw, queryRaw] = pathAndQuery.split('?');
  const pathname = (pathnameRaw || '/').replace(/\{\{(\w+)\}\}/g, '{$1}');
  const queryParams = queryRaw
    ? queryRaw.split('&').map(pair => pair.split('=')[0]).filter(Boolean)
    : [];
  return { pathname, queryParams };
}

function toOpenApiServer(origin: string): { url: string; variables?: Record<string, { default: string }> } {
  const variables: Record<string, { default: string }> = {};
  const url = origin.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    variables[name] = { default: '' };
    return `{${name}}`;
  });
  return Object.keys(variables).length > 0 ? { url, variables } : { url };
}

function sanitizeOperationId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'operation';
}

function exportSecurity(auth: ApiRequest['auth'], securitySchemes: Record<string, any>): any[] | undefined {
  if (!auth || auth.type === 'none' || auth.type === 'inherit') return undefined;
  if (auth.type === 'bearer' || auth.type === 'jwt') {
    securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer' };
    return [{ bearerAuth: [] }];
  }
  if (auth.type === 'basic') {
    securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
    return [{ basicAuth: [] }];
  }
  return undefined;
}

const MIME_BY_RAW_SUBTYPE: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
  text: 'text/plain',
};

function exportRequestBody(body: ApiRequest['body']): any | undefined {
  if (!body || body.type === 'none') return undefined;

  if (body.type === 'raw') {
    const mediaType = MIME_BY_RAW_SUBTYPE[body.rawSubtype || 'json'] || 'application/json';
    let example: any = body.data;
    if (mediaType === 'application/json' && typeof body.data === 'string') {
      try { example = JSON.parse(body.data); } catch { /* keep as raw string */ }
    }
    return { content: { [mediaType]: { schema: { type: 'string' }, example } } };
  }

  if (body.type === 'form-data' || body.type === 'x-www-form-urlencoded') {
    const mediaType = body.type === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
    const properties: Record<string, any> = {};
    for (const f of body.formData || []) {
      properties[f.key] = { type: 'string', example: f.value };
    }
    return { content: { [mediaType]: { schema: { type: 'object', properties } } } };
  }

  if (body.type === 'binary') {
    return { content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
  }

  return undefined;
}

// When two requests share a path + method (e.g. multiple OpenAPI examples imported
// as separate requests), fold the later ones into the first operation's examples
// map instead of overwriting it.
function mergeAsExample(operation: any, exampleName: string, requestBody: any | undefined): void {
  if (!requestBody) return;
  const mediaType = Object.keys(requestBody.content)[0];
  const newExample = requestBody.content[mediaType]?.example;
  if (newExample === undefined) return;

  const existing = operation.requestBody?.content?.[mediaType];
  if (!existing) return;

  if (!existing.examples) {
    existing.examples = existing.example !== undefined ? { default: { value: existing.example } } : {};
    delete existing.example;
  }
  existing.examples[exampleName] = { value: newExample };
}

/**
 * Converts a PostRebel Collection into an OpenAPI 3.0 document.
 * This is a best-effort reverse of `importOpenApi` — auth tokens, header/query
 * values, and `{{var}}` placeholders are turned back into OpenAPI parameters
 * and server variables rather than resolved concrete values.
 */
export function exportOpenApi(collection: Collection): OpenApiExportResult {
  const errors: string[] = [];

  const allRequests: Array<{ request: ApiRequest; tag?: string }> = [
    ...collection.requests.map(request => ({ request })),
    ...flattenWithTags(collection.folders || [], ''),
  ];

  const originCounts = new Map<string, number>();
  for (const { request } of allRequests) {
    const { origin } = splitUrl(request.url);
    if (origin) originCounts.set(origin, (originCounts.get(origin) || 0) + 1);
  }
  let commonOrigin = '';
  let maxCount = 0;
  for (const [origin, count] of originCounts) {
    if (count > maxCount) { commonOrigin = origin; maxCount = count; }
  }

  const securitySchemes: Record<string, any> = {};
  const paths: Record<string, any> = {};

  for (const { request, tag } of allRequests) {
    const { origin, pathAndQuery } = splitUrl(request.url);
    if (origin && commonOrigin && origin !== commonOrigin) {
      errors.push(`Request "${request.name}": host "${origin}" differs from the collection's common host "${commonOrigin}" — exported path may be incorrect.`);
    }

    const { pathname, queryParams } = toOpenApiPath(pathAndQuery);
    const pathParams = Array.from(new Set(Array.from(pathname.matchAll(/\{(\w+)\}/g)).map(m => m[1])));
    const method = request.method.toLowerCase();

    const parameters: any[] = [];
    for (const name of pathParams) {
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const name of queryParams) {
      parameters.push({ name, in: 'query', required: true, schema: { type: 'string' } });
    }
    for (const [key, value] of Object.entries(request.headers || {})) {
      if (key.toLowerCase() === 'content-type') continue;
      parameters.push({ name: key, in: 'header', required: /^\{\{.*\}\}$/.test(value), schema: { type: 'string' } });
    }

    const operation: any = {
      operationId: sanitizeOperationId(request.name),
      summary: request.name,
      responses: { '200': { description: 'Successful response' } },
    };
    if (tag) operation.tags = [tag];
    if (parameters.length > 0) operation.parameters = parameters;

    const security = exportSecurity(request.auth, securitySchemes);
    if (security) operation.security = security;

    const requestBody = exportRequestBody(request.body);
    if (requestBody) operation.requestBody = requestBody;

    paths[pathname] = paths[pathname] || {};
    if (paths[pathname][method]) {
      mergeAsExample(paths[pathname][method], request.name, requestBody);
    } else {
      paths[pathname][method] = operation;
    }
  }

  const spec: any = {
    openapi: '3.0.3',
    info: { title: collection.name, version: '1.0.0' },
    paths,
  };
  if (commonOrigin) {
    spec.servers = [toOpenApiServer(commonOrigin)];
  }
  if (Object.keys(securitySchemes).length > 0) {
    spec.components = { securitySchemes };
  }

  return { spec, errors };
}
