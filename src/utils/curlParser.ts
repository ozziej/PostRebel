import { ApiRequest, KeyValuePair } from '../types';

interface CurlParseResult {
  request: ApiRequest;
  errors: string[];
}

export function parseCurl(curlString: string): CurlParseResult {
  const errors: string[] = [];

  // Normalize: strip leading/trailing whitespace, handle line continuations
  let input = curlString.trim();
  input = input.replace(/\\\s*\n/g, ' ');
  input = input.replace(/\\\s*\r\n/g, ' ');

  // Strip leading "curl" keyword
  if (input.toLowerCase().startsWith('curl')) {
    input = input.substring(4).trim();
  } else {
    errors.push('Input does not start with "curl"');
  }

  const tokens = tokenize(input);

  let url = '';
  let method = '';
  const headers: Record<string, string> = {};
  let bodyRaw = '';
  let bodyType: 'raw' | 'form-data' | 'x-www-form-urlencoded' | '' = '';
  const formData: KeyValuePair[] = [];
  let authBasic: { username: string; password: string } | undefined;
  let hasCompressed = false;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      i++;
      if (i < tokens.length) {
        method = tokens[i].toUpperCase();
      }
    } else if (token === '-H' || token === '--header') {
      i++;
      if (i < tokens.length) {
        const headerStr = tokens[i];
        const colonIdx = headerStr.indexOf(':');
        if (colonIdx > 0) {
          const key = headerStr.substring(0, colonIdx).trim();
          const value = headerStr.substring(colonIdx + 1).trim();
          headers[key] = value;
        } else {
          errors.push(`Could not parse header: "${headerStr}"`);
        }
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      i++;
      if (i < tokens.length) {
        bodyRaw = tokens[i];
        if (!bodyType) bodyType = 'raw';
      }
    } else if (token === '--data-urlencode') {
      i++;
      if (i < tokens.length) {
        bodyType = 'x-www-form-urlencoded';
        const entry = tokens[i];
        const eqIdx = entry.indexOf('=');
        if (eqIdx > 0) {
          formData.push({
            key: entry.substring(0, eqIdx),
            value: entry.substring(eqIdx + 1),
            enabled: true,
          });
        } else {
          formData.push({ key: entry, value: '', enabled: true });
        }
      }
    } else if (token === '-F' || token === '--form') {
      i++;
      if (i < tokens.length) {
        bodyType = 'form-data';
        const entry = tokens[i];
        const eqIdx = entry.indexOf('=');
        if (eqIdx > 0) {
          formData.push({
            key: entry.substring(0, eqIdx),
            value: entry.substring(eqIdx + 1),
            enabled: true,
          });
        } else {
          formData.push({ key: entry, value: '', enabled: true });
        }
      }
    } else if (token === '-u' || token === '--user') {
      i++;
      if (i < tokens.length) {
        const userPass = tokens[i];
        const colonIdx = userPass.indexOf(':');
        if (colonIdx >= 0) {
          authBasic = {
            username: userPass.substring(0, colonIdx),
            password: userPass.substring(colonIdx + 1),
          };
        } else {
          authBasic = { username: userPass, password: '' };
        }
      }
    } else if (token === '-b' || token === '--cookie') {
      i++;
      if (i < tokens.length) {
        headers['Cookie'] = tokens[i];
      }
    } else if (token === '--compressed') {
      hasCompressed = true;
    } else if (!token.startsWith('-') && !url) {
      // First non-flag token is the URL
      url = token;
    }
    // Skip unknown flags
    i++;
  }

  if (!url) {
    errors.push('No URL found in curl command');
    url = 'https://example.com';
  }

  if (hasCompressed && !headers['Accept-Encoding']) {
    headers['Accept-Encoding'] = 'gzip, deflate';
  }

  // Determine method
  if (!method) {
    if (bodyRaw || formData.length > 0) {
      method = 'POST';
    } else {
      method = 'GET';
    }
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
  const finalMethod = validMethods.includes(method as any) ? method as typeof validMethods[number] : 'GET';
  if (!validMethods.includes(method as any) && method) {
    errors.push(`Unsupported method "${method}", defaulting to GET`);
  }

  // Build auth
  let auth: ApiRequest['auth'] = undefined;

  // Check for Bearer token in headers
  const authHeader = headers['Authorization'] || headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    auth = {
      type: 'bearer',
      bearer: authHeader.substring(7).trim(),
    };
  } else if (authBasic) {
    auth = {
      type: 'basic',
      basic: authBasic,
    };
  }

  // Build body
  let body: ApiRequest['body'] = undefined;
  if (bodyType === 'form-data') {
    body = {
      type: 'form-data',
      data: '',
      formData,
    };
  } else if (bodyType === 'x-www-form-urlencoded') {
    body = {
      type: 'x-www-form-urlencoded',
      data: '',
      formData,
    };
  } else if (bodyRaw) {
    body = {
      type: 'raw',
      data: bodyRaw,
    };
  }

  // Generate name from URL
  let name = 'Imported Request';
  try {
    const parsed = new URL(url);
    name = parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    // URL might have template variables, just use it as-is
    name = url.substring(0, 60);
  }

  const request: ApiRequest = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
    name,
    method: finalMethod,
    url,
    headers,
    body,
    auth,
  };

  return { request, errors };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;

    const ch = input[i];

    if (ch === "'" || ch === '"') {
      // Quoted string
      const quote = ch;
      i++;
      let token = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && quote === '"' && i + 1 < input.length) {
          // Handle escape in double quotes
          i++;
          token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      if (i < input.length) i++; // skip closing quote
      tokens.push(token);
    } else if (ch === '$' && i + 1 < input.length && input[i + 1] === "'") {
      // $'...' ANSI-C quoting
      i += 2;
      let token = '';
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          if (input[i] === 'n') token += '\n';
          else if (input[i] === 't') token += '\t';
          else if (input[i] === '\\') token += '\\';
          else if (input[i] === "'") token += "'";
          else token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      if (i < input.length) i++;
      tokens.push(token);
    } else {
      // Unquoted token
      let token = '';
      while (i < input.length && !/\s/.test(input[i])) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      tokens.push(token);
    }
  }

  return tokens;
}
