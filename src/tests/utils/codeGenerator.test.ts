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
