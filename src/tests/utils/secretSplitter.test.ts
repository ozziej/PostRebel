import { describe, it, expect } from 'vitest';
import { splitSecrets } from '../../utils/secretSplitter';

describe('splitSecrets', () => {
  it('redacts secret formData param values from the returned public data', () => {
    const collection = {
      id: 'c1',
      name: 'My Collection',
      requests: [
        {
          id: 'r1',
          name: 'Upload',
          method: 'POST',
          url: 'https://api.example.com/upload',
          headers: {},
          body: {
            type: 'form-data',
            data: '',
            formData: [
              { key: 'apiKey', value: 'super-secret-value', enabled: true, isSecret: true },
              { key: 'fileName', value: 'report.pdf', enabled: true, isSecret: false },
            ],
          },
        },
      ],
    };

    const { public: publicData, secrets } = splitSecrets(collection);

    // The secret value must not survive anywhere in the object written to
    // the git-tracked (non-.secrets.json) file.
    const publicRequest = publicData.requests[0];
    expect(publicRequest.body.formData).toEqual([
      { key: 'apiKey', value: '', enabled: true, isSecret: true },
      { key: 'fileName', value: 'report.pdf', enabled: true, isSecret: false },
    ]);
    expect(JSON.stringify(publicData)).not.toContain('super-secret-value');

    // The real value is preserved in the secrets bundle instead.
    expect(secrets.requests.r1.formData.apiKey).toBe('super-secret-value');
  });

  it('does not mutate the original collection object passed in', () => {
    const collection = {
      id: 'c1',
      name: 'My Collection',
      requests: [
        {
          id: 'r1',
          name: 'Upload',
          method: 'POST',
          url: 'https://api.example.com/upload',
          headers: {},
          body: {
            type: 'form-data',
            data: '',
            formData: [{ key: 'apiKey', value: 'super-secret-value', enabled: true, isSecret: true }],
          },
        },
      ],
    };

    splitSecrets(collection);

    expect(collection.requests[0].body.formData[0].value).toBe('super-secret-value');
  });

  it('redacts secret environment variables into a separate secrets map', () => {
    const environment = {
      id: 'e1',
      name: 'Prod',
      variables: { token: 'abc123' },
      variablesArray: [{ key: 'token', value: 'abc123', isSecret: true }],
    };

    const { public: publicData, secrets } = splitSecrets(environment);

    expect(publicData.variablesArray).toEqual([{ key: 'token', value: '', isSecret: true }]);
    // The legacy flat `variables` map is written to the same git-tracked file as
    // variablesArray, so it must be redacted too — not just the array.
    expect(publicData.variables.token).toBe('');
    expect(secrets.variables.token).toBe('abc123');
  });

  it('redacts secret collection-scoped variables alongside secret formData in the same collection', () => {
    const collection = {
      id: 'c1',
      name: 'My Collection',
      requests: [
        {
          id: 'r1',
          name: 'Upload',
          method: 'POST',
          url: 'https://api.example.com/upload',
          headers: {},
          body: {
            type: 'form-data',
            data: '',
            formData: [{ key: 'apiKey', value: 'form-secret', enabled: true, isSecret: true }],
          },
        },
      ],
      variables: { authToken: 'collection-secret' },
      variablesArray: [{ key: 'authToken', value: 'collection-secret', isSecret: true }],
    };

    const { public: publicData, secrets } = splitSecrets(collection);

    expect(publicData.variablesArray).toEqual([{ key: 'authToken', value: '', isSecret: true }]);
    expect(publicData.requests[0].body.formData[0].value).toBe('');
    expect(JSON.stringify(publicData)).not.toContain('collection-secret');
    expect(JSON.stringify(publicData)).not.toContain('form-secret');

    expect(secrets.variables.authToken).toBe('collection-secret');
    expect(secrets.requests.r1.formData.apiKey).toBe('form-secret');
  });

  it('redacts secret formData in a request nested two folders deep', () => {
    const collection = {
      id: 'c1',
      name: 'My Collection',
      requests: [],
      folders: [
        {
          id: 'fA',
          name: 'A',
          requests: [],
          folders: [
            {
              id: 'fB',
              name: 'B',
              requests: [
                {
                  id: 'r1',
                  name: 'Nested Upload',
                  method: 'POST',
                  url: 'https://api.example.com/upload',
                  headers: {},
                  body: {
                    type: 'form-data',
                    data: '',
                    formData: [{ key: 'apiKey', value: 'deeply-nested-secret', enabled: true, isSecret: true }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { public: publicData, secrets } = splitSecrets(collection);

    const nestedRequest = publicData.folders[0].folders[0].requests[0];
    expect(nestedRequest.body.formData[0].value).toBe('');
    expect(JSON.stringify(publicData)).not.toContain('deeply-nested-secret');
    expect(secrets.requests.r1.formData.apiKey).toBe('deeply-nested-secret');
  });
});
