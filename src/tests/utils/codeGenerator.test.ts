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
