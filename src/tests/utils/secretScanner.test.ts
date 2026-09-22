import { describe, it, expect } from 'vitest';
import {
  scanValueForSecret,
  scanKeyValueForSecret,
  scanEnvironmentForSecrets,
  scanRequestForSecrets,
} from '../../utils/secretScanner';
import { ApiRequest, Environment } from '../../types';

describe('scanValueForSecret', () => {
  it('detects known secret formats', () => {
    expect(scanValueForSecret('AKIAABCDEFGHIJKLMNOP')?.reason).toMatch(/AWS access key/);
    expect(scanValueForSecret('ghp_' + 'a'.repeat(36))?.reason).toMatch(/GitHub token/);
    expect(scanValueForSecret('github_pat_' + 'a'.repeat(22))?.reason).toMatch(/GitHub fine-grained/);
    expect(scanValueForSecret('xoxb-1234567890-abcdef')?.reason).toMatch(/Slack token/);
    expect(scanValueForSecret('AIza' + 'a'.repeat(35))?.reason).toMatch(/Google API key/);
    expect(scanValueForSecret('sk_live_' + 'a'.repeat(24))?.reason).toMatch(/Stripe/);
    expect(scanValueForSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIB...')?.reason).toMatch(/PEM private key/);
    expect(scanValueForSecret('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')?.reason).toMatch(/JWT/);
    expect(scanValueForSecret('Bearer abcdefghijklmnopqrstuvwxyz')?.reason).toMatch(/hardcoded Bearer/);
  });

  it('ignores empty values and {{template}} placeholders', () => {
    expect(scanValueForSecret('')).toBeNull();
    expect(scanValueForSecret('{{api_key}}')).toBeNull();
    expect(scanValueForSecret('Bearer {{token}}')).toBeNull();
  });

  it('does not flag ordinary values', () => {
    expect(scanValueForSecret('application/json')).toBeNull();
    expect(scanValueForSecret('en-US')).toBeNull();
    expect(scanValueForSecret('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });
});

describe('scanKeyValueForSecret', () => {
  it('flags a suspicious key name with a non-template, non-trivial value at medium confidence', () => {
    const result = scanKeyValueForSecret('api_key', 'sk-1234567890abcdef');
    expect(result?.confidence).toBe('medium');
    expect(result?.reason).toContain('api_key');
  });

  it('prefers the high-confidence known-format match over the key-name heuristic', () => {
    const result = scanKeyValueForSecret('token', 'AKIAABCDEFGHIJKLMNOP');
    expect(result?.confidence).toBe('high');
  });

  it('does not flag a suspicious key name when the value is a template reference', () => {
    expect(scanKeyValueForSecret('api_key', '{{api_key}}')).toBeNull();
  });

  it('does not flag a suspicious key name when the value is short', () => {
    expect(scanKeyValueForSecret('password', '123')).toBeNull();
  });

  it('does not flag a non-suspicious key name with an ordinary value', () => {
    expect(scanKeyValueForSecret('content_type', 'application/json')).toBeNull();
  });
});

describe('scanEnvironmentForSecrets', () => {
  it('flags a non-secret-marked variable that looks like a secret', () => {
    const environment: Environment = {
      id: 'e1',
      name: 'Prod',
      variables: {},
      variablesArray: [
        { key: 'api_key', value: 'AKIAABCDEFGHIJKLMNOP', isSecret: false },
        { key: 'base_url', value: 'https://api.example.com', isSecret: false },
      ],
    };

    const findings = scanEnvironmentForSecrets(environment);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe('variable: api_key');
  });

  it('skips variables already marked as secret', () => {
    const environment: Environment = {
      id: 'e1',
      name: 'Prod',
      variables: {},
      variablesArray: [{ key: 'api_key', value: 'AKIAABCDEFGHIJKLMNOP', isSecret: true }],
    };

    expect(scanEnvironmentForSecrets(environment)).toEqual([]);
  });
});

describe('scanRequestForSecrets', () => {
  it('flags a hardcoded secret in a header (headers have no secret-marking mechanism)', () => {
    const request: ApiRequest = {
      id: 'r1',
      name: 'Get Widget',
      method: 'GET',
      url: 'https://api.example.com/widgets',
      headers: {
        Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
        Accept: 'application/json',
      },
    };

    const findings = scanRequestForSecrets(request);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe('header: Authorization');
  });

  it('flags a non-secret-marked form-data param that looks like a secret', () => {
    const request: ApiRequest = {
      id: 'r1',
      name: 'Upload',
      method: 'POST',
      url: 'https://api.example.com/upload',
      headers: {},
      body: {
        type: 'form-data',
        data: '',
        formData: [
          { key: 'apiKey', value: 'AKIAABCDEFGHIJKLMNOP', enabled: true, isSecret: false },
          { key: 'fileName', value: 'report.pdf', enabled: true, isSecret: false },
        ],
      },
    };

    const findings = scanRequestForSecrets(request);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe('form field: apiKey');
  });

  it('skips form-data params already marked as secret', () => {
    const request: ApiRequest = {
      id: 'r1',
      name: 'Upload',
      method: 'POST',
      url: 'https://api.example.com/upload',
      headers: {},
      body: {
        type: 'form-data',
        data: '',
        formData: [{ key: 'apiKey', value: 'AKIAABCDEFGHIJKLMNOP', enabled: true, isSecret: true }],
      },
    };

    expect(scanRequestForSecrets(request)).toEqual([]);
  });

  it('does not flag headers using {{variable}} placeholders', () => {
    const request: ApiRequest = {
      id: 'r1',
      name: 'Get Widget',
      method: 'GET',
      url: 'https://api.example.com/widgets',
      headers: { Authorization: 'Bearer {{token}}' },
    };

    expect(scanRequestForSecrets(request)).toEqual([]);
  });
});
