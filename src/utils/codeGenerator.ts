import { ApiRequest, Environment, Collection } from '../types';
import { resolveDynamicVariable } from './dynamicVariables';

/**
 * Substitute {{varName}} placeholders with environment values.
 * Resolves dynamic variables first, then variablesArray, then legacy variables.
 */
function substituteVars(text: string, env: Environment | null): string {
  if (!env) return text;

  return text.replace(/\{\{([\w.$]+)\}\}/g, (match, varName) => {
    const dynamic = resolveDynamicVariable(varName);
    if (dynamic !== null) return dynamic;
    // Check variablesArray first (with enabled/secret checks)
    if (env.variablesArray) {
      const envVar = env.variablesArray.find(v => v.key === varName);
      if (envVar && !envVar.isSecret) {
        return envVar.value;
      }
    }

    // Fall back to legacy variables object
    if (env.variables && env.variables[varName] !== undefined) {
      return env.variables[varName];
    }

    // Leave unknown vars as-is
    return match;
  });
}

/**
 * Resolve authentication header value based on request and collection auth.
 * Mirrors httpService.ts auth logic.
 */
function resolveAuthHeader(
  request: ApiRequest,
  collection: Collection | null,
  env: Environment | null
): string | null {
  let effectiveAuth = request.auth;

  // Handle inherited auth
  if (request.auth?.type === 'inherit' && collection?.auth) {
    effectiveAuth = collection.auth;
  }

  if (!effectiveAuth || effectiveAuth.type === 'none') {
    return null;
  }

  switch (effectiveAuth.type) {
    case 'bearer': {
      const token = substituteVars(effectiveAuth.bearer || '', env);
      return `Bearer ${token}`;
    }
    case 'basic': {
      if (effectiveAuth.basic) {
        const username = substituteVars(effectiveAuth.basic.username, env);
        const password = substituteVars(effectiveAuth.basic.password, env);
        const credentials = btoa(`${username}:${password}`);
        return `Basic ${credentials}`;
      }
      break;
    }
    case 'jwt': {
      const token = substituteVars(effectiveAuth.jwt || '', env);
      return `JWT ${token}`;
    }
  }

  return null;
}

/**
 * Build complete headers object by merging request headers and auth header.
 */
function buildHeaders(
  request: ApiRequest,
  env: Environment | null,
  authHeader: string | null
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Add request headers with variable substitution
  Object.entries(request.headers).forEach(([key, value]) => {
    headers[key] = substituteVars(value, env);
  });

  // Add auth header if present
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return headers;
}

/**
 * Generate cURL command for the request.
 */
export function generateCurl(
  request: ApiRequest,
  environment: Environment | null,
  collection: Collection | null
): string {
  const url = substituteVars(request.url, environment);
  const authHeader = resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];
  lines.push(`curl -X ${request.method} '${url}'`);

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    lines.push(`  -H '${key}: ${value}'`);
  });

  // Add body
  if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    switch (request.body.type) {
      case 'raw': {
        const body = substituteVars(request.body.data as string, environment);
        // Escape single quotes in body
        const escapedBody = body.replace(/'/g, "'\\''");
        lines.push(`  --data-raw '${escapedBody}'`);
        break;
      }
      case 'form-data': {
        if (request.body.formData && request.body.formData.length > 0) {
          request.body.formData
            .filter(item => item.enabled && item.key)
            .forEach(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/'/g, "'\\''");
              lines.push(`  -F '${item.key}=${escapedValue}'`);
            });
        }
        break;
      }
      case 'x-www-form-urlencoded': {
        if (request.body.formData && request.body.formData.length > 0) {
          request.body.formData
            .filter(item => item.enabled && item.key)
            .forEach(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/'/g, "'\\''");
              lines.push(`  --data-urlencode '${item.key}=${escapedValue}'`);
            });
        }
        break;
      }
    }
  }

  // Join lines with backslash continuation (except last line)
  return lines.map((line, i) => {
    if (i === lines.length - 1) {
      return line; // No trailing backslash on last line
    }
    return line + ' \\';
  }).join('\n');
}

/**
 * Generate JavaScript fetch code for the request.
 */
export function generateFetch(
  request: ApiRequest,
  environment: Environment | null,
  collection: Collection | null
): string {
  const url = substituteVars(request.url, environment);
  const authHeader = resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];
  lines.push(`const response = await fetch('${url}', {`);
  lines.push(`  method: '${request.method}',`);

  // Add headers if present
  if (Object.keys(headers).length > 0) {
    lines.push(`  headers: {`);
    Object.entries(headers).forEach(([key, value]) => {
      lines.push(`    '${key}': '${value.replace(/'/g, "\\'")}',`);
    });
    lines.push(`  },`);
  }

  // Add body (only for methods that support it)
  if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    switch (request.body.type) {
      case 'raw': {
        const body = substituteVars(request.body.data as string, environment);
        const escapedBody = body.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        lines.push(`  body: '${escapedBody}',`);
        break;
      }
      case 'form-data': {
        if (request.body.formData && request.body.formData.length > 0) {
          lines.push(`  body: (() => {`);
          lines.push(`    const formData = new FormData();`);
          request.body.formData
            .filter(item => item.enabled && item.key)
            .forEach(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              lines.push(`    formData.append('${item.key}', '${escapedValue}');`);
            });
          lines.push(`    return formData;`);
          lines.push(`  })(),`);
        }
        break;
      }
      case 'x-www-form-urlencoded': {
        if (request.body.formData && request.body.formData.length > 0) {
          lines.push(`  body: (() => {`);
          lines.push(`    const params = new URLSearchParams();`);
          request.body.formData
            .filter(item => item.enabled && item.key)
            .forEach(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              lines.push(`    params.append('${item.key}', '${escapedValue}');`);
            });
          lines.push(`    return params;`);
          lines.push(`  })(),`);
        }
        break;
      }
    }
  }

  lines.push(`});`);
  lines.push(`const data = await response.json();`);

  return lines.join('\n');
}

/**
 * Generate Python requests code for the request.
 */
export function generatePython(
  request: ApiRequest,
  environment: Environment | null,
  collection: Collection | null
): string {
  const url = substituteVars(request.url, environment);
  const authHeader = resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];
  lines.push(`import requests`);
  lines.push(``);

  const method = request.method.toLowerCase();
  const args: string[] = [];

  // URL (first positional argument)
  args.push(`    '${url}'`);

  // Headers
  if (Object.keys(headers).length > 0) {
    const headerEntries = Object.entries(headers).map(([key, value]) => {
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${key}': '${escapedValue}'`;
    });
    args.push(`    headers={${headerEntries.join(', ')}}`);
  }

  // Body (only for methods that support it)
  if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentType = headers['Content-Type'] || '';

    switch (request.body.type) {
      case 'raw': {
        const body = substituteVars(request.body.data as string, environment);

        // Check if it's JSON content
        if (contentType.includes('application/json')) {
          try {
            // Try to parse as JSON for prettier output
            const parsed = JSON.parse(body);
            args.push(`    json=${JSON.stringify(parsed)}`);
          } catch {
            // If parsing fails, pass as data string
            const escapedBody = body.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
            args.push(`    data='${escapedBody}'`);
          }
        } else {
          // Non-JSON raw body
          const escapedBody = body.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
          args.push(`    data='${escapedBody}'`);
        }
        break;
      }
      case 'form-data': {
        if (request.body.formData && request.body.formData.length > 0) {
          const fileEntries = request.body.formData
            .filter(item => item.enabled && item.key)
            .map(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              return `'${item.key}': '${escapedValue}'`;
            });
          args.push(`    files={${fileEntries.join(', ')}}`);
        }
        break;
      }
      case 'x-www-form-urlencoded': {
        if (request.body.formData && request.body.formData.length > 0) {
          const dataEntries = request.body.formData
            .filter(item => item.enabled && item.key)
            .map(item => {
              const value = substituteVars(item.value, environment);
              const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              return `'${item.key}': '${escapedValue}'`;
            });
          args.push(`    data={${dataEntries.join(', ')}}`);
        }
        break;
      }
    }
  }

  // Build the function call
  lines.push(`response = requests.${method}(`);
  lines.push(args.join(',\n') + ',');
  lines.push(`)`);
  lines.push(`data = response.json()`);

  return lines.join('\n');
}
