import { describe, it, expect } from 'vitest';
import { formatJsonText, formatGraphqlQuery } from '../../utils/textFormat';

describe('formatJsonText', () => {
  it('pretty-prints minified JSON', () => {
    expect(formatJsonText('{"a":1,"b":[1,2,3]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    3\n  ]\n}');
  });

  it('preserves a quoted {{variable}} placeholder exactly, including its position', () => {
    const formatted = formatJsonText('{"userId":"{{userId}}","active":true}');
    expect(formatted).toBe('{\n  "userId": "{{userId}}",\n  "active": true\n}');
  });

  it('preserves a bare (unquoted) {{variable}} placeholder used as a raw value', () => {
    const formatted = formatJsonText('{"id":{{id}}}');
    expect(formatted).toBe('{\n  "id": {{id}}\n}');
  });

  it('handles multiple distinct placeholders without cross-contamination', () => {
    const formatted = formatJsonText('{"a":"{{x}}","b":"{{y}}"}');
    expect(formatted).toBe('{\n  "a": "{{x}}",\n  "b": "{{y}}"\n}');
  });

  it('throws on invalid JSON', () => {
    expect(() => formatJsonText('{not valid')).toThrow();
  });
});

describe('formatGraphqlQuery', () => {
  it('pretty-prints a minified query (graphql-js prints an anonymous query as shorthand, dropping the "query" keyword)', () => {
    const formatted = formatGraphqlQuery('query{post(id:"1"){id title}}');
    expect(formatted).toBe('{\n  post(id: "1") {\n    id\n    title\n  }\n}');
  });

  it('preserves a {{variable}} placeholder used as a quoted argument value', () => {
    const formatted = formatGraphqlQuery('query { post(id: "{{postId}}") { title } }');
    expect(formatted).toContain('"{{postId}}"');
  });

  it('preserves a {{variable}} placeholder used as a bare (unquoted) argument value', () => {
    const formatted = formatGraphqlQuery('query { posts(limit: {{limit}}) { id } }');
    expect(formatted).toContain('{{limit}}');
    expect(formatted).not.toContain('"{{limit}}"');
  });

  it('formats a query with variable definitions and a mutation-style operation', () => {
    const formatted = formatGraphqlQuery('mutation CreatePost($title:String!){createPost(title:$title){id}}');
    expect(formatted).toBe('mutation CreatePost($title: String!) {\n  createPost(title: $title) {\n    id\n  }\n}');
  });

  it('throws on invalid GraphQL syntax', () => {
    expect(() => formatGraphqlQuery('query { this is not valid {{{')).toThrow();
  });
});
