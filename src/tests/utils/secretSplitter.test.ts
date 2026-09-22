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
    expect(secrets.variables.token).toBe('abc123');
  });
});
