import { ApiResponse, Environment, OAuth2Config } from '../types';

// Fetches and caches OAuth2 access tokens for the 'oauth2' auth type.
//
// Only grant types that can run headlessly are supported (client_credentials,
// password, refresh_token, and authorization_code assuming the code was
// already obtained elsewhere) — a browser-redirect authorization_code/PKCE
// flow needs an interactive redirect capture that has no equivalent in the
// CLI runner, so it's intentionally out of scope.
//
// Tokens are cached in-memory only (never written to disk), keyed by the
// resolved token request so distinct requests/environments that share a
// client + token URL + scope reuse one token instead of re-fetching it for
// every node in a runner.

export type OAuth2Transport = (config: any) => Promise<{
  success: boolean;
  response?: ApiResponse;
  error?: { code?: string; message: string };
}>;

export type ReplaceVariables = (text: string, environment: Environment) => string;

export interface OAuth2TokenRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function resolveOAuth2Vars(config: OAuth2Config, environment: Environment, replaceVariables: ReplaceVariables): OAuth2Config {
  const sub = (v?: string) => (v ? replaceVariables(v, environment) : v);
  return {
    ...config,
    accessTokenUrl: sub(config.accessTokenUrl) || '',
    clientId: sub(config.clientId),
    clientSecret: sub(config.clientSecret),
    username: sub(config.username),
    password: sub(config.password),
    scope: sub(config.scope),
    authorizationCode: sub(config.authorizationCode),
    redirectUri: sub(config.redirectUri),
    refreshToken: sub(config.refreshToken),
  };
}

// Builds the token-endpoint request from an already variable-resolved config.
// Shared by the runtime token fetcher below and codeGenerator's snippet output,
// so the exact same request shape is what gets both executed and shown to the user.
export function buildOAuth2TokenRequest(resolved: OAuth2Config): OAuth2TokenRequest {
  const params = new URLSearchParams();
  params.set('grant_type', resolved.grantType);

  switch (resolved.grantType) {
    case 'client_credentials':
      if (resolved.scope) params.set('scope', resolved.scope);
      break;
    case 'password':
      params.set('username', resolved.username || '');
      params.set('password', resolved.password || '');
      if (resolved.scope) params.set('scope', resolved.scope);
      break;
    case 'authorization_code':
      params.set('code', resolved.authorizationCode || '');
      if (resolved.redirectUri) params.set('redirect_uri', resolved.redirectUri);
      break;
    case 'refresh_token':
      params.set('refresh_token', resolved.refreshToken || '');
      break;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  };

  if (resolved.clientAuthentication === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${resolved.clientId || ''}:${resolved.clientSecret || ''}`)}`;
  } else {
    if (resolved.clientId) params.set('client_id', resolved.clientId);
    if (resolved.clientSecret) params.set('client_secret', resolved.clientSecret);
  }

  return { url: resolved.accessTokenUrl, headers, body: params.toString() };
}

interface CachedToken {
  accessToken: string;
  headerPrefix: string;
  expiresAt: number; // epoch ms; Infinity if the token response had no expiry
  refreshToken?: string;
}

const tokenCache = new Map<string, CachedToken>();

function cacheKey(resolved: OAuth2Config): string {
  return JSON.stringify([
    resolved.grantType, resolved.accessTokenUrl, resolved.clientId, resolved.scope, resolved.username,
  ]);
}

export function clearOAuth2Cache(): void {
  tokenCache.clear();
}

const EXPIRY_SAFETY_MARGIN_MS = 30_000;

export interface OAuth2TokenResult {
  accessToken: string;
  headerPrefix: string;
  expiresAt: number;
  fromCache: boolean;
}

export async function getOAuth2AccessToken(
  config: OAuth2Config,
  environment: Environment,
  transport: OAuth2Transport,
  replaceVariables: ReplaceVariables,
  options: { forceRefresh?: boolean } = {},
): Promise<OAuth2TokenResult> {
  const resolved = resolveOAuth2Vars(config, environment, replaceVariables);
  if (!resolved.accessTokenUrl) {
    throw oauth2Error('OAuth2: no access token URL configured');
  }

  const key = cacheKey(resolved);
  const cached = tokenCache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { accessToken: cached.accessToken, headerPrefix: cached.headerPrefix, expiresAt: cached.expiresAt, fromCache: true };
  }

  // Prefer refreshing an existing token over re-running the original grant,
  // when we have a refresh token to spend (either cached from a prior fetch,
  // or manually supplied for grantType 'refresh_token' itself).
  const refreshToken = cached?.refreshToken || (resolved.grantType === 'refresh_token' ? resolved.refreshToken : undefined);
  const requestConfig: OAuth2Config = refreshToken && resolved.grantType !== 'refresh_token'
    ? { ...resolved, grantType: 'refresh_token', refreshToken }
    : resolved;

  const tokenRequest = buildOAuth2TokenRequest(requestConfig);
  const result = await transport({
    method: 'post',
    url: tokenRequest.url,
    headers: tokenRequest.headers,
    data: tokenRequest.body,
    timeout: 30000,
    rejectUnauthorized: true,
  });

  if (!result.success || !result.response) {
    throw oauth2Error(`OAuth2 token request failed: ${result.error?.message || 'unknown error'}`);
  }

  const data = result.response.data;
  if (result.response.status >= 400) {
    throw oauth2Error(`OAuth2 token request failed (${result.response.status}): ${describeTokenErrorBody(data)}`);
  }

  const accessToken = data && typeof data === 'object' ? data.access_token : undefined;
  if (!accessToken) {
    throw oauth2Error(`OAuth2 token response did not include an access_token: ${describeTokenErrorBody(data)}`);
  }

  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const expiresAt = Date.now() + expiresInSeconds * 1000 - EXPIRY_SAFETY_MARGIN_MS;
  const headerPrefix = resolved.headerPrefix?.trim() || capitalizeTokenType(data.token_type) || 'Bearer';

  tokenCache.set(key, { accessToken, headerPrefix, expiresAt, refreshToken: data.refresh_token });

  return { accessToken, headerPrefix, expiresAt, fromCache: false };
}

function capitalizeTokenType(tokenType: unknown): string | null {
  if (typeof tokenType !== 'string' || !tokenType.trim()) return null;
  return tokenType[0].toUpperCase() + tokenType.slice(1);
}

function describeTokenErrorBody(data: any): string {
  if (data == null) return '(empty response)';
  if (typeof data === 'string') return data.slice(0, 200);
  return (data.error_description || data.error || JSON.stringify(data)).toString().slice(0, 200);
}

function oauth2Error(message: string): Error {
  const error: any = new Error(message);
  error.request = true;
  error.oauth2 = true;
  return error;
}
