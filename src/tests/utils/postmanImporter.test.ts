import { describe, it, expect } from 'vitest';
import { importPostmanCollection } from '../../utils/postmanImporter';

describe('importPostmanCollection - collection-level variables', () => {
  it('populates collection.variablesArray/variables directly, for pm.collectionVariables', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [],
      variable: [
        { key: 'apiBase', value: 'https://api.example.com' },
        { key: 'version', value: 'v2' },
      ],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));

    expect(result.collection.variablesArray).toEqual([
      { key: 'apiBase', value: 'https://api.example.com', isSecret: false },
      { key: 'version', value: 'v2', isSecret: false },
    ]);
    expect(result.collection.variables).toEqual({ apiBase: 'https://api.example.com', version: 'v2' });
  });

  it('still returns a synthetic "<name> Variables" Environment for {{variable}} substitution compatibility', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [],
      variable: [{ key: 'apiBase', value: 'https://api.example.com' }],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));

    expect(result.collectionVariables?.name).toBe('My API Variables');
    expect(result.collectionVariables?.variables).toEqual({ apiBase: 'https://api.example.com' });
  });

  it('does not set variables/variablesArray when the collection has no top-level variable array', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));

    expect(result.collection.variablesArray).toBeUndefined();
    expect(result.collection.variables).toBeUndefined();
    expect(result.collectionVariables).toBeUndefined();
  });
});
