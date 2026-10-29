import { describe, it, expect } from 'vitest';
import { generateCurl, generateFetch, generatePython } from '../../utils/codeGenerator';
import { ApiRequest, Environment } from '../../types';

function makeGraphqlRequest(query: string, variables: string): ApiRequest {
  return {
    id: 'r1',
    name: 'GraphQL',
    method: 'POST',
    url: 'https://api.example.com/graphql',
    headers: {},
    body: { type: 'graphql', data: '', graphql: { query, variables } },
  };
}

const env: Environment = { id: 'e1', name: 'Test', variables: { id: '7' } };

describe('generateCurl - graphql body', () => {
  it('sends the query+variables as a single JSON --data-raw payload', () => {
    const curl = generateCurl(makeGraphqlRequest('{ post(id: "{{id}}") { title } }', '{"id":"{{id}}"}'), env, null);
    expect(curl).toContain("--data-raw '");
    const match = curl.match(/--data-raw '(.*)'/);
    expect(JSON.parse(match![1])).toEqual({ query: '{ post(id: "7") { title } }', variables: { id: '7' } });
  });
});

describe('generateFetch - graphql body', () => {
  it('generates a body: JSON.stringify({...}) call with substituted variables', () => {
    const fetch = generateFetch(makeGraphqlRequest('{ posts { id } }', ''), env, null);
    expect(fetch).toContain('body: JSON.stringify({"query":"{ posts { id } }"}),');
  });
});

describe('generatePython - graphql body', () => {
  it('generates a json= kwarg with the resolved payload', () => {
    const python = generatePython(makeGraphqlRequest('{ posts { id } }', '{"limit": "{{id}}"}'), env, null);
    expect(python).toContain('json={"query":"{ posts { id } }","variables":{"limit":"7"}}');
  });
});

function makeOAuth2Request(): ApiRequest {
  return {
    id: 'r1',
    name: 'Protected',
    method: 'GET',
    url: 'https://api.example.com/me',
    headers: {},
    auth: {
      type: 'oauth2',
      oauth2: {
        grantType: 'client_credentials',
        accessTokenUrl: 'https://auth.example.com/oauth/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
        scope: 'read',
      },
    },
  };
}

describe('generateCurl - oauth2 auth', () => {
  it('generates a token-fetch preamble and references it in the Authorization header', () => {
    const curl = generateCurl(makeOAuth2Request(), env, null);
    expect(curl).toContain("curl -s -X POST 'https://auth.example.com/oauth/token'");
    expect(curl).toContain('grant_type=client_credentials');
    expect(curl).toContain('client_id=my-client');
    expect(curl).toContain('-H "Authorization: Bearer $ACCESS_TOKEN"');
  });
});

describe('generateFetch - oauth2 auth', () => {
  it('fetches a token first, then uses it in the Authorization header', () => {
    const fetch = generateFetch(makeOAuth2Request(), env, null);
    expect(fetch).toContain("await fetch('https://auth.example.com/oauth/token'");
    expect(fetch).toContain("'Authorization': `Bearer ${access_token}`,");
  });
});

describe('generatePython - oauth2 auth', () => {
  it('requests a token first, then uses it in the Authorization header', () => {
    const python = generatePython(makeOAuth2Request(), env, null);
    expect(python).toContain("token_response = requests.post(");
    expect(python).toContain("'Authorization': f'Bearer {access_token}'");
  });
});

function makeBodyRequest(body: ApiRequest['body'], headers: Record<string, string> = {}, method: ApiRequest['method'] = 'POST'): ApiRequest {
  return {
    id: 'r1',
    name: 'Body',
    method,
    url: 'https://api.example.com/items',
    headers,
    body,
  };
}

describe('generateCurl - body Content-Type header', () => {
  it('adds Content-Type: application/json for a raw JSON body', () => {
    const curl = generateCurl(makeBodyRequest({ type: 'raw', rawSubtype: 'json', data: '{"a":1}' }), null, null);
    expect(curl).toContain("-H 'Content-Type: application/json'");
  });

  it('uses the matching Content-Type for other raw subtypes', () => {
    const xml = generateCurl(makeBodyRequest({ type: 'raw', rawSubtype: 'xml', data: '<a/>' }), null, null);
    const html = generateCurl(makeBodyRequest({ type: 'raw', rawSubtype: 'html', data: '<p/>' }), null, null);
    const text = generateCurl(makeBodyRequest({ type: 'raw', rawSubtype: 'text', data: 'hi' }), null, null);
    expect(xml).toContain("-H 'Content-Type: application/xml'");
    expect(html).toContain("-H 'Content-Type: text/html'");
    expect(text).toContain("-H 'Content-Type: text/plain'");
  });

  it('adds application/x-www-form-urlencoded for x-www-form-urlencoded bodies', () => {
    const curl = generateCurl(
      makeBodyRequest({ type: 'x-www-form-urlencoded', data: '', formData: [{ key: 'a', value: '1', enabled: true }] }),
      null,
      null
    );
    expect(curl).toContain("-H 'Content-Type: application/x-www-form-urlencoded'");
  });

  it('adds no body Content-Type for form-data, so curl can generate the multipart boundary', () => {
    const curl = generateCurl(
      makeBodyRequest({ type: 'form-data', data: '', formData: [{ key: 'a', value: '1', enabled: true }] }),
      null,
      null
    );
    expect(curl).not.toContain('Content-Type');
    expect(curl).toContain("-F 'a=1'");
  });

  it('removes a user-set Content-Type on form-data bodies, since it would break the multipart boundary', () => {
    const curl = generateCurl(
      makeBodyRequest(
        { type: 'form-data', data: '', formData: [{ key: 'a', value: '1', enabled: true }] },
        { 'content-type': 'multipart/form-data' }
      ),
      null,
      null
    );
    expect(curl).not.toContain('multipart/form-data');
  });

  it('keeps a user-set Content-Type over the one implied by the body', () => {
    const curl = generateCurl(
      makeBodyRequest({ type: 'raw', rawSubtype: 'json', data: '{}' }, { 'Content-Type': 'application/vnd.api+json' }),
      null,
      null
    );
    expect(curl).toContain("-H 'Content-Type: application/vnd.api+json'");
    expect(curl).not.toContain("-H 'Content-Type: application/json'");
  });

  it('adds no body Content-Type for GET requests or bodies of type none', () => {
    const get = generateCurl(makeBodyRequest({ type: 'raw', rawSubtype: 'json', data: '{}' }, {}, 'GET'), null, null);
    const none = generateCurl(makeBodyRequest({ type: 'none', data: '' }), null, null);
    expect(get).not.toContain('Content-Type');
    expect(none).not.toContain('Content-Type');
  });
});

describe('generateFetch and generatePython - body Content-Type header', () => {
  it('includes the body Content-Type in fetch headers', () => {
    const fetch = generateFetch(makeBodyRequest({ type: 'raw', rawSubtype: 'json', data: '{}' }), null, null);
    expect(fetch).toContain("'Content-Type': 'application/json',");
  });

  it('sends a JSON raw body as json= in Python, since Content-Type is now known', () => {
    const python = generatePython(makeBodyRequest({ type: 'raw', rawSubtype: 'json', data: '{"a":1}' }), null, null);
    expect(python).toContain('json={"a":1}');
  });
});
