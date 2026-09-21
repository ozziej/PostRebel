import { Collection, ApiRequest, Environment } from '../types';

function exportAuth(auth: ApiRequest['auth'] | Collection['auth']): any | undefined {
  if (!auth || auth.type === 'none') return { type: 'noauth' };
  if (auth.type === 'inherit') return undefined; // omitting `auth` makes Postman inherit from the parent
  if (auth.type === 'bearer') {
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.bearer || '', type: 'string' }] };
  }
  if (auth.type === 'basic') {
    return {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.basic?.username || '', type: 'string' },
        { key: 'password', value: auth.basic?.password || '', type: 'string' },
      ],
    };
  }
  if (auth.type === 'jwt') {
    // Postman v2's auth schema has no "jwt" type — export as bearer so the token still
    // lands as an Authorization header when opened in Postman.
    return { type: 'bearer', bearer: [{ key: 'token', value: auth.jwt || '', type: 'string' }] };
  }
  return { type: 'noauth' };
}

const RAW_LANGUAGE_BY_SUBTYPE: Record<string, string> = {
  json: 'json',
  xml: 'xml',
  html: 'html',
  javascript: 'javascript',
  text: 'text',
};

function exportBody(body: ApiRequest['body']): any | undefined {
  if (!body || body.type === 'none') return undefined;

  if (body.type === 'raw') {
    return {
      mode: 'raw',
      raw: typeof body.data === 'string' ? body.data : '',
      options: { raw: { language: RAW_LANGUAGE_BY_SUBTYPE[body.rawSubtype || 'json'] || 'json' } },
    };
  }
  if (body.type === 'form-data') {
    return {
      mode: 'formdata',
      formdata: (body.formData || []).map(f => ({ key: f.key, value: f.value, disabled: !f.enabled, type: 'text' })),
    };
  }
  if (body.type === 'x-www-form-urlencoded') {
    return {
      mode: 'urlencoded',
      urlencoded: (body.formData || []).map(f => ({ key: f.key, value: f.value, disabled: !f.enabled })),
    };
  }
  if (body.type === 'binary') {
    return { mode: 'file', file: { src: body.binaryFileName || body.binaryFilePath || '' } };
  }
  return undefined;
}

function exportRequestItem(request: ApiRequest): any {
  const item: any = {
    name: request.name,
    request: {
      method: request.method,
      header: Object.entries(request.headers || {}).map(([key, value]) => ({ key, value })),
      url: { raw: request.url },
    },
  };

  const body = exportBody(request.body);
  if (body) item.request.body = body;

  const auth = exportAuth(request.auth);
  if (auth) item.request.auth = auth;

  const events: any[] = [];
  if (request.preRequestScript) {
    events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: request.preRequestScript.split('\n') } });
  }
  if (request.testScript) {
    events.push({ listen: 'test', script: { type: 'text/javascript', exec: request.testScript.split('\n') } });
  }
  if (events.length > 0) item.event = events;

  return item;
}

/**
 * Converts a PostRebel Collection into a Postman v2.1 collection JSON object.
 * Folders are exported one level deep (PostRebel's own model has no nested folders).
 */
export function exportPostmanCollection(collection: Collection): any {
  const item: any[] = collection.requests.map(exportRequestItem);

  for (const folder of collection.folders || []) {
    item.push({
      name: folder.name,
      item: folder.requests.map(exportRequestItem),
    });
  }

  const postmanCollection: any = {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item,
  };

  const auth = exportAuth(collection.auth);
  if (auth) postmanCollection.auth = auth;

  return postmanCollection;
}

/**
 * Converts a PostRebel Environment into a Postman environment JSON object.
 * Secret variables are marked with `type: "secret"`, mirroring `importPostmanEnvironment`.
 */
export function exportPostmanEnvironment(environment: Environment): any {
  const variablesArray = environment.variablesArray && environment.variablesArray.length > 0
    ? environment.variablesArray
    : Object.entries(environment.variables).map(([key, value]) => ({ key, value, isSecret: false }));

  return {
    id: environment.id,
    name: environment.name,
    values: variablesArray.map(v => ({
      key: v.key,
      value: v.value,
      type: v.isSecret ? 'secret' : 'default',
      enabled: true,
    })),
    _postman_variable_scope: 'environment',
  };
}
