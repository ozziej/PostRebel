import { describe, it, expect } from 'vitest';
import { parseIntrospectionResult, extractIntrospectionErrors, INTROSPECTION_QUERY } from '../../utils/graphqlIntrospection';

function nonNull(ofType: any) { return { kind: 'NON_NULL', name: null, ofType }; }
function list(ofType: any) { return { kind: 'LIST', name: null, ofType }; }
function named(name: string) { return { kind: 'OBJECT', name, ofType: null }; }
function scalar(name: string) { return { kind: 'SCALAR', name, ofType: null }; }

function makeSchema() {
  return {
    data: {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: { name: 'Mutation' },
        types: [
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [
              {
                name: 'post',
                description: 'Fetch a single post',
                args: [{ name: 'id', type: nonNull(scalar('ID')) }],
                type: named('Post'),
              },
              {
                name: 'posts',
                args: [],
                type: nonNull(list(nonNull(named('Post')))),
              },
            ],
          },
          {
            kind: 'OBJECT',
            name: 'Mutation',
            fields: [
              {
                name: 'createPost',
                args: [
                  { name: 'title', type: nonNull(scalar('String')) },
                  { name: 'body', type: scalar('String') },
                ],
                type: named('Post'),
              },
            ],
          },
          { kind: 'OBJECT', name: 'Post', fields: [] },
        ],
      },
    },
  };
}

describe('parseIntrospectionResult', () => {
  it('extracts query and mutation fields with formatted arg/return types', () => {
    const summary = parseIntrospectionResult(makeSchema());
    expect(summary).not.toBeNull();
    expect(summary!.queryTypeName).toBe('Query');
    expect(summary!.mutationTypeName).toBe('Mutation');

    expect(summary!.queries).toEqual([
      { name: 'post', args: '(id: ID!)', returnType: 'Post', description: 'Fetch a single post' },
      { name: 'posts', args: '', returnType: '[Post!]!', description: undefined },
    ]);
    expect(summary!.mutations).toEqual([
      { name: 'createPost', args: '(title: String!, body: String)', returnType: 'Post', description: undefined },
    ]);
  });

  it('returns null when the response has no __schema (not a valid introspection response)', () => {
    expect(parseIntrospectionResult({ data: {} })).toBeNull();
    expect(parseIntrospectionResult({})).toBeNull();
    expect(parseIntrospectionResult(null)).toBeNull();
  });

  it('handles a schema with no mutation type', () => {
    const schema = makeSchema();
    schema.data.__schema.mutationType = null as any;
    const summary = parseIntrospectionResult(schema);
    expect(summary!.mutationTypeName).toBeNull();
    expect(summary!.mutations).toEqual([]);
  });
});

describe('extractIntrospectionErrors', () => {
  it('extracts error messages from a GraphQL error response', () => {
    const errors = extractIntrospectionErrors({ errors: [{ message: 'Introspection disabled' }, { message: 'Boom' }] });
    expect(errors).toEqual(['Introspection disabled', 'Boom']);
  });

  it('returns an empty array when there are no errors', () => {
    expect(extractIntrospectionErrors({ data: {} })).toEqual([]);
    expect(extractIntrospectionErrors(null)).toEqual([]);
  });
});

describe('INTROSPECTION_QUERY', () => {
  it('is a well-formed query requesting __schema', () => {
    expect(INTROSPECTION_QUERY).toContain('__schema');
    expect(INTROSPECTION_QUERY).toContain('queryType');
    expect(INTROSPECTION_QUERY).toContain('mutationType');
  });
});
