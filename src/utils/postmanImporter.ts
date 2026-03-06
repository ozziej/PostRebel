import { Collection, CollectionFolder, ApiRequest, Environment, EnvironmentVariable, KeyValuePair } from '../types';

interface PostmanCollectionResult {
  collection: Collection;
  collectionVariables?: Environment;
  errors: string[];
}

interface PostmanEnvironmentResult {
  environment: Environment;
  errors: string[];
}

export function importPostmanCollection(json: string): PostmanCollectionResult {
  const errors: string[] = [];

  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: could not parse the file contents');
  }

  // Validate schema
  if (!data.info) {
    throw new Error('Not a valid Postman collection: missing "info" field');
  }

  const schema = data.info.schema || '';
  if (!schema.includes('v2.1') && !schema.includes('v2.0')) {
    errors.push(`Unexpected schema version: "${schema}". Expected v2.0 or v2.1. Import may be incomplete.`);
  }

  const collectionId = Date.now().toString();
  const collectionName = data.info.name || 'Imported Collection';

  // Parse top-level items, preserving folder structure
  const { requests, folders } = parseTopLevelItems(data.item || [], errors);

  const collection: Collection = {
    id: collectionId,
    name: collectionName,
    requests,
    folders: folders.length > 0 ? folders : undefined,
  };

  const result: PostmanCollectionResult = { collection, errors };

  // Handle collection-level variables
  if (data.variable && Array.isArray(data.variable) && data.variable.length > 0) {
    const variables: Record<string, string> = {};
    const variablesArray: EnvironmentVariable[] = [];

    for (const v of data.variable) {
      if (v.key) {
        variables[v.key] = v.value || '';
        variablesArray.push({
          key: v.key,
          value: v.value || '',
          isSecret: false,
        });
      }
    }

    result.collectionVariables = {
      id: (Date.now() + 1).toString(),
      name: `${collectionName} Variables`,
      variables,
      variablesArray,
    };
  }

  return result;
}

function parseTopLevelItems(items: any[], errors: string[]): { requests: ApiRequest[]; folders: CollectionFolder[] } {
  const requests: ApiRequest[] = [];
  const folders: CollectionFolder[] = [];

  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      // This is a folder — create a CollectionFolder
      const folderRequests: ApiRequest[] = [];
      flattenFolderItems(item.item, folderRequests, errors);
      folders.push({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        name: item.name || 'Folder',
        requests: folderRequests,
      });
    } else if (item.request) {
      // Top-level request (not inside any folder)
      try {
        const apiRequest = parsePostmanRequest(item, item.name || 'Request', errors);
        requests.push(apiRequest);
      } catch (e: any) {
        errors.push(`Failed to parse request "${item.name}": ${e.message}`);
      }
    }
  }

  return { requests, folders };
}

function flattenFolderItems(items: any[], requests: ApiRequest[], errors: string[]): void {
  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      // Nested sub-folder — flatten into parent folder since CollectionFolder doesn't support nesting
      flattenFolderItems(item.item, requests, errors);
    } else if (item.request) {
      try {
        const apiRequest = parsePostmanRequest(item, item.name || 'Request', errors);
        requests.push(apiRequest);
      } catch (e: any) {
        errors.push(`Failed to parse request "${item.name}": ${e.message}`);
      }
    }
  }
}

function parsePostmanRequest(item: any, name: string, errors: string[]): ApiRequest {
  const req = item.request;

  // URL
  let url = '';
  if (typeof req.url === 'string') {
    url = req.url;
  } else if (req.url && typeof req.url === 'object') {
    url = req.url.raw || '';
  }

  // Method
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
  const rawMethod = (req.method || 'GET').toUpperCase();
  const method = validMethods.includes(rawMethod as any) ? rawMethod as typeof validMethods[number] : 'GET';
  if (!validMethods.includes(rawMethod as any)) {
    errors.push(`Request "${name}": unsupported method "${rawMethod}", defaulting to GET`);
  }

  // Headers
  const headers: Record<string, string> = {};
  if (Array.isArray(req.header)) {
    for (const h of req.header) {
      if (h.key && !h.disabled) {
        headers[h.key] = h.value || '';
      }
    }
  }

  // Body
  let body: ApiRequest['body'] = undefined;
  if (req.body) {
    const mode = req.body.mode;
    if (mode === 'raw') {
      // Detect subtype from Postman's language option if available
      const rawLang = req.body.options?.raw?.language || '';
      let rawSubtype: 'text' | 'javascript' | 'json' | 'html' | 'xml' = 'json';
      if (rawLang === 'xml') rawSubtype = 'xml';
      else if (rawLang === 'html') rawSubtype = 'html';
      else if (rawLang === 'javascript') rawSubtype = 'javascript';
      else if (rawLang === 'text') rawSubtype = 'text';

      body = {
        type: 'raw',
        rawSubtype,
        data: req.body.raw || '',
      };
    } else if (mode === 'formdata') {
      const formData: KeyValuePair[] = (req.body.formdata || []).map((f: any) => ({
        key: f.key || '',
        value: f.value || '',
        enabled: f.disabled !== true,
      }));
      body = {
        type: 'form-data',
        data: '',
        formData,
      };
    } else if (mode === 'urlencoded') {
      const formData: KeyValuePair[] = (req.body.urlencoded || []).map((f: any) => ({
        key: f.key || '',
        value: f.value || '',
        enabled: f.disabled !== true,
      }));
      body = {
        type: 'x-www-form-urlencoded',
        data: '',
        formData,
      };
    }
  }

  // Auth
  let auth: ApiRequest['auth'] = undefined;
  if (req.auth) {
    const authType = req.auth.type;
    if (authType === 'bearer') {
      const bearerArray = req.auth.bearer || [];
      const tokenItem = bearerArray.find((b: any) => b.key === 'token');
      auth = {
        type: 'bearer',
        bearer: tokenItem?.value || '',
      };
    } else if (authType === 'basic') {
      const basicArray = req.auth.basic || [];
      const usernameItem = basicArray.find((b: any) => b.key === 'username');
      const passwordItem = basicArray.find((b: any) => b.key === 'password');
      auth = {
        type: 'basic',
        basic: {
          username: usernameItem?.value || '',
          password: passwordItem?.value || '',
        },
      };
    } else if (authType === 'noauth') {
      auth = { type: 'none' };
    } else {
      auth = { type: 'none' };
      errors.push(`Request "${name}": unsupported auth type "${authType}", set to none`);
    }
  }

  // Scripts
  let preRequestScript: string | undefined;
  let testScript: string | undefined;

  if (Array.isArray(item.event)) {
    for (const event of item.event) {
      if (event.listen === 'prerequest' && event.script?.exec) {
        preRequestScript = Array.isArray(event.script.exec)
          ? event.script.exec.join('\n')
          : String(event.script.exec);
      } else if (event.listen === 'test' && event.script?.exec) {
        testScript = Array.isArray(event.script.exec)
          ? event.script.exec.join('\n')
          : String(event.script.exec);
      }
    }
  }

  return {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
    name,
    method,
    url,
    headers,
    body,
    auth,
    preRequestScript,
    testScript,
  };
}

export function importPostmanEnvironment(json: string): PostmanEnvironmentResult {
  const errors: string[] = [];

  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: could not parse the file contents');
  }

  if (!data.name && !data.values) {
    throw new Error('Not a valid Postman environment: missing "name" or "values" field');
  }

  const variables: Record<string, string> = {};
  const variablesArray: EnvironmentVariable[] = [];

  if (Array.isArray(data.values)) {
    for (const item of data.values) {
      if (!item.key) continue;

      if (item.enabled === false) {
        errors.push(`Variable "${item.key}" is disabled in Postman — imported anyway`);
      }

      const isSecret = item.type === 'secret';
      variables[item.key] = item.value || '';
      variablesArray.push({
        key: item.key,
        value: item.value || '',
        isSecret,
      });
    }
  }

  const environment: Environment = {
    id: Date.now().toString(),
    name: data.name || 'Imported Environment',
    variables,
    variablesArray,
  };

  return { environment, errors };
}
