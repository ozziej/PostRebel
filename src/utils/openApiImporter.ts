import * as yaml from 'js-yaml';
import { Collection, CollectionFolder, ApiRequest } from '../types';

export interface OpenApiImportResult {
  collection: Collection;
  errors: string[];
  version: string;
  title: string;
}

let _idCounter = 0;
function generateId(): string {
  return `${Date.now()}-${++_idCounter}-${Math.random().toString(36).substr(2, 5)}`;
}

function generateExampleFromSchema(schema: any, spec: any, depth: number = 0): any {
  if (depth > 3 || !schema) return null;

  // Resolve $ref
  if (schema.$ref) {
    const ref: string = schema.$ref;
    const parts = ref.replace(/^#\//, '').split('/');
    let resolved: any = spec;
    for (const part of parts) {
      resolved = resolved?.[part];
    }
    if (!resolved) return null;
    return generateExampleFromSchema(resolved, spec, depth + 1);
  }

  if (schema.example !== undefined) return schema.example;

  // Use first schema from combiners
  if (schema.allOf) return generateExampleFromSchema(schema.allOf[0], spec, depth);
  if (schema.oneOf) return generateExampleFromSchema(schema.oneOf[0], spec, depth);
  if (schema.anyOf) return generateExampleFromSchema(schema.anyOf[0], spec, depth);

  switch (schema.type) {
    case 'string':
      if (schema.enum) return schema.enum[0];
      return 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'array':
      if (depth >= 3) return [];
      return [generateExampleFromSchema(schema.items || {}, spec, depth + 1)];
    case 'object': {
      const result: Record<string, any> = {};
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          result[key] = generateExampleFromSchema(propSchema as any, spec, depth + 1);
        }
      }
      return result;
    }
    default:
      return null;
  }
}

function convertPathParams(path: string): string {
  return path.replace(/\{(\w+)\}/g, '{{$1}}');
}

interface BodyCandidate {
  exampleName?: string;
  body?: ApiRequest['body'];
}

export function importOpenApi(input: string): OpenApiImportResult {
  const errors: string[] = [];

  let spec: any;
  try {
    spec = yaml.load(input);
  } catch (e: any) {
    throw new Error(`Failed to parse OpenAPI spec: ${e.message}`);
  }

  if (!spec || typeof spec !== 'object') {
    throw new Error('Invalid OpenAPI spec: not an object');
  }

  // Detect version
  let version: string;
  if (spec.swagger === '2.0') {
    version = '2.0';
  } else if (spec.openapi && typeof spec.openapi === 'string') {
    if (spec.openapi.startsWith('3.0') || spec.openapi.startsWith('3.1')) {
      version = spec.openapi;
    } else {
      throw new Error(`Unsupported OpenAPI version: ${spec.openapi}`);
    }
  } else {
    throw new Error('Unrecognised spec format: missing "swagger" or "openapi" field');
  }

  const title = spec.info?.title || 'Imported API';

  // Build base URL
  let baseUrl = '';
  if (version === '2.0') {
    const scheme = (spec.schemes && spec.schemes[0]) || 'https';
    const host = spec.host || '';
    const basePath = spec.basePath || '/';
    baseUrl = host ? `${scheme}://${host}${basePath === '/' ? '' : basePath}` : '';
  } else {
    baseUrl = (spec.servers && spec.servers[0]?.url) || '';
    baseUrl = baseUrl.replace(/\/$/, '');
  }

  // Security definitions/schemes
  const securityDefs = version === '2.0'
    ? (spec.securityDefinitions || {})
    : (spec.components?.securitySchemes || {});

  const folderMap = new Map<string, ApiRequest[]>();
  const topLevelRequests: ApiRequest[] = [];

  const paths = spec.paths || {};
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathItemObj = pathItem as any;

    for (const method of httpMethods) {
      const operation = pathItemObj[method];
      if (!operation) continue;

      const convertedPath = convertPathParams(path);
      const fullUrl = baseUrl + convertedPath;
      const requestName = operation.operationId || `${method.toUpperCase()} ${path}`;

      const headers: Record<string, string> = {};

      // Auth
      let auth: ApiRequest['auth'] = { type: 'none' };
      const securityReqs: any[] = operation.security || spec.security || [];
      if (securityReqs.length > 0 && typeof securityReqs[0] === 'object') {
        const firstSecKey = Object.keys(securityReqs[0])[0];
        if (firstSecKey && securityDefs[firstSecKey]) {
          const secDef = securityDefs[firstSecKey];
          if (version === '2.0') {
            if (secDef.type === 'basic') {
              auth = { type: 'basic', basic: { username: '', password: '' } };
            } else if (secDef.type === 'oauth2') {
              auth = { type: 'bearer', bearer: '' };
            } else if (secDef.type === 'apiKey') {
              if (secDef.in === 'header') {
                headers[secDef.name] = `{{${firstSecKey}}}`;
              }
            }
          } else {
            if (secDef.type === 'http') {
              if (secDef.scheme === 'bearer') {
                auth = { type: 'bearer', bearer: '' };
              } else if (secDef.scheme === 'basic') {
                auth = { type: 'basic', basic: { username: '', password: '' } };
              }
            } else if (secDef.type === 'apiKey') {
              if (secDef.in === 'header') {
                headers[secDef.name] = `{{${firstSecKey}}}`;
              }
            } else if (secDef.type === 'oauth2' || secDef.type === 'openIdConnect') {
              auth = { type: 'bearer', bearer: '' };
            }
          }
        }
      }

      // Query params (required only)
      const pathLevelParams: any[] = pathItemObj.parameters || [];
      const opLevelParams: any[] = operation.parameters || [];
      const allParams = [...pathLevelParams, ...opLevelParams];
      const queryParts: string[] = [];
      for (const param of allParams) {
        if (param.in === 'query' && param.required) {
          queryParts.push(`${param.name}={{${param.name}}}`);
        }
      }
      const urlWithQuery = queryParts.length > 0 ? `${fullUrl}?${queryParts.join('&')}` : fullUrl;

      // Body candidates
      let bodyCandidates: BodyCandidate[] = [{}];

      if (version === '2.0') {
        const bodyParam = allParams.find((p: any) => p.in === 'body');
        if (bodyParam) {
          const contentType = (operation.consumes && operation.consumes[0]) ||
            (spec.consumes && spec.consumes[0]) || 'application/json';
          headers['Content-Type'] = contentType;

          const schema = bodyParam.schema;
          let exampleData = bodyParam.example ?? (schema?.example);
          if (exampleData === undefined && schema) {
            exampleData = generateExampleFromSchema(schema, spec);
          }
          if (exampleData !== undefined && exampleData !== null) {
            bodyCandidates = [{
              body: { type: 'raw', rawSubtype: 'json', data: JSON.stringify(exampleData, null, 2) },
            }];
          }
        }
      } else {
        const requestBody = operation.requestBody;
        if (requestBody) {
          const content = requestBody.content || {};
          const mediaType = content['application/json']
            ? 'application/json'
            : Object.keys(content)[0];

          if (mediaType && content[mediaType]) {
            headers['Content-Type'] = mediaType;
            const mediaContent = content[mediaType];

            if (mediaContent.examples && Object.keys(mediaContent.examples).length > 0) {
              bodyCandidates = Object.entries(mediaContent.examples).map(([exName, exObj]: [string, any]) => {
                const exValue = exObj.value !== undefined ? exObj.value : exObj;
                return {
                  exampleName: exName,
                  body: { type: 'raw' as const, rawSubtype: 'json' as const, data: JSON.stringify(exValue, null, 2) },
                };
              });
            } else if (mediaContent.example !== undefined) {
              bodyCandidates = [{
                body: { type: 'raw', rawSubtype: 'json', data: JSON.stringify(mediaContent.example, null, 2) },
              }];
            } else if (mediaContent.schema) {
              const exData = generateExampleFromSchema(mediaContent.schema, spec);
              if (exData !== undefined && exData !== null) {
                bodyCandidates = [{
                  body: { type: 'raw', rawSubtype: 'json', data: JSON.stringify(exData, null, 2) },
                }];
              }
            }
          }
        }
      }

      const tags: string[] = operation.tags || [];
      const primaryTag = tags[0] || null;

      for (const candidate of bodyCandidates) {
        const name = candidate.exampleName
          ? `${requestName} (${candidate.exampleName})`
          : requestName;

        const apiRequest: ApiRequest = {
          id: generateId(),
          name,
          method: method.toUpperCase() as ApiRequest['method'],
          url: urlWithQuery,
          headers: { ...headers },
          auth,
          ...(candidate.body ? { body: candidate.body } : {}),
        };

        if (primaryTag) {
          if (!folderMap.has(primaryTag)) {
            folderMap.set(primaryTag, []);
          }
          folderMap.get(primaryTag)!.push(apiRequest);
        } else {
          topLevelRequests.push(apiRequest);
        }
      }
    }
  }

  const folders: CollectionFolder[] = [];
  for (const [tagName, requests] of folderMap.entries()) {
    folders.push({
      id: generateId(),
      name: tagName,
      requests,
    });
  }

  const collection: Collection = {
    id: Date.now().toString(),
    name: title,
    requests: topLevelRequests,
    folders: folders.length > 0 ? folders : undefined,
  };

  return { collection, errors, version, title };
}
