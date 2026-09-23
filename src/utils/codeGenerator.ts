import { ApiRequest, Environment, Collection, OAuth2Config } from '../types';
import { resolveDynamicVariable } from './dynamicVariables';
import { buildOAuth2TokenRequest, resolveOAuth2Vars, OAuth2TokenRequest } from './oauth2';

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
function resolveEffectiveAuth(request: ApiRequest, collection: Collection | null): ApiRequest['auth'] {
  if (request.auth?.type === 'inherit' && collection?.auth) return collection.auth;
  return request.auth;
}

function resolveAuthHeader(
  request: ApiRequest,
  collection: Collection | null,
  env: Environment | null
): string | null {
  const effectiveAuth = resolveEffectiveAuth(request, collection);

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
    // 'oauth2' is handled separately by buildOAuth2Preamble — the token is
    // fetched by a preamble request, not a value known at generation time.
  }

  return null;
}

// Resolves a request's OAuth2 config (following collection inheritance) with
// variables substituted, or null if this request isn't using OAuth2 auth.
// The token itself can't be known at code-generation time, so callers embed
// a preamble that fetches it and reference `headerPrefix` for the header scheme.
function getEffectiveOAuth2Request(
  request: ApiRequest,
  collection: Collection | null,
  env: Environment | null
): { tokenRequest: OAuth2TokenRequest; headerPrefix: string } | null {
  const effectiveAuth = resolveEffectiveAuth(request, collection);
  if (effectiveAuth?.type !== 'oauth2' || !effectiveAuth.oauth2) return null;
  const replaceVariables = (text: string) => substituteVars(text, env);
  const resolved = resolveOAuth2Vars(effectiveAuth.oauth2, (env || {}) as Environment, replaceVariables);
  return { tokenRequest: buildOAuth2TokenRequest(resolved), headerPrefix: resolved.headerPrefix?.trim() || 'Bearer' };
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

// Builds the {query, variables} JSON payload GraphQL sends as its request body.
function buildGraphqlPayloadJson(body: ApiRequest['body'], env: Environment | null): string {
  const query = substituteVars(body?.graphql?.query || '', env);
  const variablesText = substituteVars(body?.graphql?.variables || '', env);
  const payload: any = { query };
  if (variablesText.trim()) {
    try {
      payload.variables = JSON.parse(variablesText);
    } catch {
      // Invalid variables JSON — omit rather than send a broken payload
    }
  }
  return JSON.stringify(payload);
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
  const oauth2 = getEffectiveOAuth2Request(request, collection, environment);
  const authHeader = oauth2 ? null : resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];

  if (oauth2) {
    lines.push(`# 1. Get an OAuth2 access token`);
    lines.push(`ACCESS_TOKEN=$(curl -s -X POST '${oauth2.tokenRequest.url}' \\`);
    Object.entries(oauth2.tokenRequest.headers).forEach(([key, value]) => {
      lines.push(`  -H '${key}: ${value}' \\`);
    });
    lines.push(`  --data-raw '${oauth2.tokenRequest.body}' \\`);
    lines.push(`  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")`);
    lines.push('');
    lines.push(`# 2. Use it to call the API`);
  }

  lines.push(`curl -X ${request.method} '${url}'`);

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    lines.push(`  -H '${key}: ${value}'`);
  });
  if (oauth2) {
    lines.push(`  -H "Authorization: ${oauth2.headerPrefix} $ACCESS_TOKEN"`);
  }

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
      case 'graphql': {
        const payload = buildGraphqlPayloadJson(request.body, environment);
        const escapedBody = payload.replace(/'/g, "'\\''");
        lines.push(`  --data-raw '${escapedBody}'`);
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
  const oauth2 = getEffectiveOAuth2Request(request, collection, environment);
  const authHeader = oauth2 ? null : resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];

  if (oauth2) {
    lines.push(`// 1. Get an OAuth2 access token`);
    lines.push(`const tokenResponse = await fetch('${oauth2.tokenRequest.url}', {`);
    lines.push(`  method: 'POST',`);
    lines.push(`  headers: {`);
    Object.entries(oauth2.tokenRequest.headers).forEach(([key, value]) => {
      lines.push(`    '${key}': '${value.replace(/'/g, "\\'")}',`);
    });
    lines.push(`  },`);
    lines.push(`  body: '${oauth2.tokenRequest.body.replace(/'/g, "\\'")}',`);
    lines.push(`});`);
    lines.push(`const { access_token } = await tokenResponse.json();`);
    lines.push('');
    lines.push(`// 2. Use it to call the API`);
  }

  lines.push(`const response = await fetch('${url}', {`);
  lines.push(`  method: '${request.method}',`);

  // Add headers if present
  if (Object.keys(headers).length > 0 || oauth2) {
    lines.push(`  headers: {`);
    Object.entries(headers).forEach(([key, value]) => {
      lines.push(`    '${key}': '${value.replace(/'/g, "\\'")}',`);
    });
    if (oauth2) {
      lines.push(`    'Authorization': \`${oauth2.headerPrefix} \${access_token}\`,`);
    }
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
      case 'graphql': {
        const payload = buildGraphqlPayloadJson(request.body, environment);
        lines.push(`  body: JSON.stringify(${payload}),`);
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
  const oauth2 = getEffectiveOAuth2Request(request, collection, environment);
  const authHeader = oauth2 ? null : resolveAuthHeader(request, collection, environment);
  const headers = buildHeaders(request, environment, authHeader);

  const lines: string[] = [];
  lines.push(`import requests`);
  lines.push(``);

  if (oauth2) {
    const tokenHeaderEntries = Object.entries(oauth2.tokenRequest.headers).map(([key, value]) => {
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${key}': '${escapedValue}'`;
    });
    lines.push(`# 1. Get an OAuth2 access token`);
    lines.push(`token_response = requests.post(`);
    lines.push(`    '${oauth2.tokenRequest.url}',`);
    lines.push(`    headers={${tokenHeaderEntries.join(', ')}},`);
    lines.push(`    data='${oauth2.tokenRequest.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`);
    lines.push(`)`);
    lines.push(`access_token = token_response.json()['access_token']`);
    lines.push(``);
    lines.push(`# 2. Use it to call the API`);
  }

  const method = request.method.toLowerCase();
  const args: string[] = [];

  // URL (first positional argument)
  args.push(`    '${url}'`);

  // Headers
  if (Object.keys(headers).length > 0 || oauth2) {
    const headerEntries = Object.entries(headers).map(([key, value]) => {
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${key}': '${escapedValue}'`;
    });
    if (oauth2) {
      headerEntries.push(`'Authorization': f'${oauth2.headerPrefix} {access_token}'`);
    }
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
      case 'graphql': {
        const payload = buildGraphqlPayloadJson(request.body, environment);
        args.push(`    json=${payload}`);
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
