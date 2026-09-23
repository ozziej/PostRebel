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

describe('importPostmanCollection - nested folders', () => {
  it('preserves a sub-folder nested inside a folder, instead of flattening it', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'Users',
          item: [
            { name: 'List Users', request: { method: 'GET', url: 'https://api.example.com/users' } },
            {
              name: 'Admin',
              item: [
                { name: 'Ban User', request: { method: 'POST', url: 'https://api.example.com/users/ban' } },
              ],
            },
          ],
        },
      ],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));

    expect(result.collection.folders).toHaveLength(1);
    const usersFolder = result.collection.folders![0];
    expect(usersFolder.name).toBe('Users');
    expect(usersFolder.requests.map(r => r.name)).toEqual(['List Users']);

    expect(usersFolder.folders).toHaveLength(1);
    const adminFolder = usersFolder.folders![0];
    expect(adminFolder.name).toBe('Admin');
    expect(adminFolder.requests.map(r => r.name)).toEqual(['Ban User']);
  });

  it('preserves folders nested three levels deep', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'A',
          item: [
            {
              name: 'B',
              item: [
                {
                  name: 'C',
                  item: [
                    { name: 'Deep Request', request: { method: 'GET', url: 'https://api.example.com/deep' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));

    const folderA = result.collection.folders![0];
    const folderB = folderA.folders![0];
    const folderC = folderB.folders![0];
    expect([folderA.name, folderB.name, folderC.name]).toEqual(['A', 'B', 'C']);
    expect(folderC.requests.map(r => r.name)).toEqual(['Deep Request']);
  });

  it('omits the folders field when a folder has no sub-folders', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        { name: 'Flat', item: [{ name: 'Req', request: { method: 'GET', url: 'https://api.example.com/x' } }] },
      ],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));
    expect(result.collection.folders![0].folders).toBeUndefined();
  });
});

describe('importPostmanCollection - graphql body', () => {
  it('imports a graphql-mode request into body.type = "graphql"', () => {
    const postmanCollection = {
      info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{
        name: 'Get Post',
        request: {
          method: 'POST',
          url: 'https://api.example.com/graphql',
          body: { mode: 'graphql', graphql: { query: '{ post(id: 1) { title } }', variables: '{"id": 1}' } },
        },
      }],
    };

    const result = importPostmanCollection(JSON.stringify(postmanCollection));
    const request = result.collection.requests[0];
    expect(request.body).toEqual({
      type: 'graphql',
      data: '',
      graphql: { query: '{ post(id: 1) { title } }', variables: '{"id": 1}' },
    });
  });
});
