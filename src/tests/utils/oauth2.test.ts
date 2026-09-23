import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildOAuth2TokenRequest, getOAuth2AccessToken, clearOAuth2Cache, resolveOAuth2Vars } from '../../utils/oauth2';
import { Environment, OAuth2Config } from '../../types';

const env: Environment = { id: 'e1', name: 'Test', variables: { clientId: 'env-client', clientSecret: 'env-secret' } };
const replaceVariables = (text: string, e: Environment) =>
  text.replace(/\{\{(\w+)\}\}/g, (m, key) => e.variables[key] ?? m);

describe('buildOAuth2TokenRequest', () => {
  it('builds a client_credentials request with body-based client auth', () => {
    const req = buildOAuth2TokenRequest({
      grantType: 'client_credentials', accessTokenUrl: 'https://auth/token',
      clientId: 'cid', clientSecret: 'secret', scope: 'read write',
    });
    expect(req.url).toBe('https://auth/token');
    expect(req.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(req.headers['Authorization']).toBeUndefined();
    const params = new URLSearchParams(req.body);
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(params.get('client_id')).toBe('cid');
    expect(params.get('client_secret')).toBe('secret');
    expect(params.get('scope')).toBe('read write');
  });

  it('sends client credentials as a Basic Authorization header when configured', () => {
    const req = buildOAuth2TokenRequest({
      grantType: 'client_credentials', accessTokenUrl: 'https://auth/token',
      clientId: 'cid', clientSecret: 'secret', clientAuthentication: 'basic',
    });
    expect(req.headers['Authorization']).toBe(`Basic ${btoa('cid:secret')}`);
    const params = new URLSearchParams(req.body);
    expect(params.get('client_id')).toBeNull();
    expect(params.get('client_secret')).toBeNull();
  });

  it('builds a password grant request with username/password', () => {
    const req = buildOAuth2TokenRequest({
      grantType: 'password', accessTokenUrl: 'https://auth/token', username: 'alice', password: 'pw123',
    });
    const params = new URLSearchParams(req.body);
    expect(params.get('grant_type')).toBe('password');
    expect(params.get('username')).toBe('alice');
    expect(params.get('password')).toBe('pw123');
  });

  it('builds an authorization_code grant request with code and redirect_uri', () => {
    const req = buildOAuth2TokenRequest({
      grantType: 'authorization_code', accessTokenUrl: 'https://auth/token',
      authorizationCode: 'abc', redirectUri: 'https://app/callback',
    });
    const params = new URLSearchParams(req.body);
    expect(params.get('code')).toBe('abc');
    expect(params.get('redirect_uri')).toBe('https://app/callback');
  });

  it('builds a refresh_token grant request', () => {
    const req = buildOAuth2TokenRequest({
      grantType: 'refresh_token', accessTokenUrl: 'https://auth/token', refreshToken: 'rt-1',
    });
    const params = new URLSearchParams(req.body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('rt-1');
  });
});

describe('resolveOAuth2Vars', () => {
  it('substitutes variables in every relevant field', () => {
    const resolved = resolveOAuth2Vars(
      { grantType: 'client_credentials', accessTokenUrl: 'https://auth/token', clientId: '{{clientId}}', clientSecret: '{{clientSecret}}' },
      env, replaceVariables,
    );
    expect(resolved.clientId).toBe('env-client');
    expect(resolved.clientSecret).toBe('env-secret');
  });
});

function mockTransport(response: { status: number; data: any }) {
  return vi.fn().mockResolvedValue({ success: true, response: { ...response, statusText: '', headers: {}, time: 1, size: 1 } });
}

describe('getOAuth2AccessToken', () => {
  beforeEach(() => clearOAuth2Cache());

  const config: OAuth2Config = {
    grantType: 'client_credentials', accessTokenUrl: 'https://auth/token', clientId: 'cid', clientSecret: 'secret',
  };

  it('fetches a token and returns it with the default Bearer prefix', async () => {
    const transport = mockTransport({ status: 200, data: { access_token: 'tok-1', expires_in: 3600 } });
    const result = await getOAuth2AccessToken(config, env, transport, replaceVariables);
    expect(result.accessToken).toBe('tok-1');
    expect(result.headerPrefix).toBe('Bearer');
    expect(result.fromCache).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('capitalizes the response token_type when no explicit headerPrefix is set', async () => {
    const transport = mockTransport({ status: 200, data: { access_token: 'tok-1', token_type: 'bearer' } });
    const result = await getOAuth2AccessToken(config, env, transport, replaceVariables);
    expect(result.headerPrefix).toBe('Bearer');
  });

  it('honors an explicit headerPrefix override', async () => {
    const transport = mockTransport({ status: 200, data: { access_token: 'tok-1', token_type: 'mac' } });
    const result = await getOAuth2AccessToken({ ...config, headerPrefix: 'Token' }, env, transport, replaceVariables);
    expect(result.headerPrefix).toBe('Token');
  });

  it('reuses a cached token on a second call instead of re-fetching', async () => {
    const transport = mockTransport({ status: 200, data: { access_token: 'tok-1', expires_in: 3600 } });
    await getOAuth2AccessToken(config, env, transport, replaceVariables);
    const second = await getOAuth2AccessToken(config, env, transport, replaceVariables);
    expect(second.fromCache).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the cached token has expired', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce({ success: true, response: { status: 200, data: { access_token: 'tok-1', expires_in: 1 }, statusText: '', headers: {}, time: 1, size: 1 } })
      .mockResolvedValueOnce({ success: true, response: { status: 200, data: { access_token: 'tok-2', expires_in: 3600 }, statusText: '', headers: {}, time: 1, size: 1 } });
    const first = await getOAuth2AccessToken(config, env, transport, replaceVariables);
    expect(first.accessToken).toBe('tok-1');
    // expires_in of 1s minus the 30s safety margin means it's already "expired".
    const second = await getOAuth2AccessToken(config, env, transport, replaceVariables);
    expect(second.accessToken).toBe('tok-2');
    expect(second.fromCache).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('uses a cached refresh_token to refresh rather than re-running the original grant', async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce({ success: true, response: { status: 200, data: { access_token: 'tok-1', expires_in: 1, refresh_token: 'rt-1' }, statusText: '', headers: {}, time: 1, size: 1 } })
      .mockResolvedValueOnce({ success: true, response: { status: 200, data: { access_token: 'tok-2', expires_in: 3600 }, statusText: '', headers: {}, time: 1, size: 1 } });
    await getOAuth2AccessToken(config, env, transport, replaceVariables);
    await getOAuth2AccessToken(config, env, transport, replaceVariables);
    const secondCallBody = new URLSearchParams(transport.mock.calls[1][0].data);
    expect(secondCallBody.get('grant_type')).toBe('refresh_token');
    expect(secondCallBody.get('refresh_token')).toBe('rt-1');
  });

  it('bypasses the cache when forceRefresh is set', async () => {
    const transport = mockTransport({ status: 200, data: { access_token: 'tok-1', expires_in: 3600 } });
    await getOAuth2AccessToken(config, env, transport, replaceVariables);
    await getOAuth2AccessToken(config, env, transport, replaceVariables, { forceRefresh: true });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('throws a descriptive error when the token endpoint returns an error status', async () => {
    const transport = mockTransport({ status: 401, data: { error: 'invalid_client', error_description: 'bad credentials' } });
    await expect(getOAuth2AccessToken(config, env, transport, replaceVariables)).rejects.toThrow(/bad credentials/);
  });

  it('throws a descriptive error when the response has no access_token', async () => {
    const transport = mockTransport({ status: 200, data: { foo: 'bar' } });
    await expect(getOAuth2AccessToken(config, env, transport, replaceVariables)).rejects.toThrow(/did not include an access_token/);
  });

  it('throws when the transport itself fails', async () => {
    const transport = vi.fn().mockResolvedValue({ success: false, error: { message: 'ECONNREFUSED' } });
    await expect(getOAuth2AccessToken(config, env, transport, replaceVariables)).rejects.toThrow(/ECONNREFUSED/);
  });
});
