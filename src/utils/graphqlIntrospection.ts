// Standard GraphQL schema introspection: the query sent "on URL entry", plus
// parsing of the result into a flat, render-friendly summary of Query/Mutation
// fields. Not a full schema browser — just enough to see what's queryable.

export const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      fields(includeDeprecated: false) {
        name
        description
        args {
          name
          type { ...TypeRef }
        }
        type { ...TypeRef }
      }
    }
  }
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
        }
      }
    }
  }
}
`.trim();

interface IntrospectionTypeRef {
  kind: string;
  name: string | null;
  ofType: IntrospectionTypeRef | null;
}

interface IntrospectionArg {
  name: string;
  type: IntrospectionTypeRef;
}

interface IntrospectionField {
  name: string;
  description?: string | null;
  args: IntrospectionArg[];
  type: IntrospectionTypeRef;
}

interface IntrospectionNamedType {
  kind: string;
  name: string | null;
  fields: IntrospectionField[] | null;
}

export interface GraphQLFieldSummary {
  name: string;
  args: string;
  returnType: string;
  description?: string;
}

export interface GraphQLSchemaSummary {
  queryTypeName: string | null;
  mutationTypeName: string | null;
  queries: GraphQLFieldSummary[];
  mutations: GraphQLFieldSummary[];
}

// Renders a possibly NON_NULL/LIST-wrapped type ref as GraphQL SDL syntax, e.g. "[Post!]!"
function formatTypeRef(ref: IntrospectionTypeRef | null | undefined): string {
  if (!ref) return 'Unknown';
  if (ref.kind === 'NON_NULL') return `${formatTypeRef(ref.ofType)}!`;
  if (ref.kind === 'LIST') return `[${formatTypeRef(ref.ofType)}]`;
  return ref.name || 'Unknown';
}

function formatArgs(args: IntrospectionArg[] | undefined): string {
  if (!args || args.length === 0) return '';
  return `(${args.map(a => `${a.name}: ${formatTypeRef(a.type)}`).join(', ')})`;
}

function summarizeFields(fields: IntrospectionField[] | null | undefined): GraphQLFieldSummary[] {
  if (!fields) return [];
  return fields.map(f => ({
    name: f.name,
    args: formatArgs(f.args),
    returnType: formatTypeRef(f.type),
    description: f.description || undefined,
  }));
}

// `responseData` is the raw parsed JSON body of an introspection response (the
// full `{ data: { __schema: {...} }, errors?: [...] }` GraphQL envelope).
export function parseIntrospectionResult(responseData: any): GraphQLSchemaSummary | null {
  const schema = responseData?.data?.__schema;
  if (!schema) return null;

  const types: IntrospectionNamedType[] = schema.types || [];
  const queryTypeName: string | null = schema.queryType?.name ?? null;
  const mutationTypeName: string | null = schema.mutationType?.name ?? null;

  const findType = (name: string | null) => (name ? types.find(t => t.name === name) : undefined);

  return {
    queryTypeName,
    mutationTypeName,
    queries: summarizeFields(findType(queryTypeName)?.fields),
    mutations: summarizeFields(findType(mutationTypeName)?.fields),
  };
}

export function extractIntrospectionErrors(responseData: any): string[] {
  if (!Array.isArray(responseData?.errors)) return [];
  return responseData.errors.map((e: any) => e?.message || 'Unknown error').filter(Boolean);
}
