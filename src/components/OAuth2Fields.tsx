import React, { useState } from 'react';
import { Environment, OAuth2Config } from '../types';
import { VariableInput } from './VariableInput';
import { HttpService } from '../utils/httpService';
import { getOAuth2AccessToken } from '../utils/oauth2';

interface OAuth2FieldsProps {
  value: OAuth2Config;
  onChange: (value: OAuth2Config) => void;
  environment: Environment | null;
  onUpdateVariable?: (key: string, value: string) => void;
  disabled?: boolean;
}

const GRANT_TYPE_LABELS: Record<OAuth2Config['grantType'], string> = {
  client_credentials: 'Client Credentials',
  password: 'Password Credentials',
  authorization_code: 'Authorization Code (code already obtained)',
  refresh_token: 'Refresh Token',
};

export const OAuth2Fields: React.FC<OAuth2FieldsProps> = ({ value, onChange, environment, onUpdateVariable, disabled }) => {
  const [testState, setTestState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  const update = (updates: Partial<OAuth2Config>) => onChange({ ...value, ...updates });

  const inputProps = {
    environment,
    onUpdateVariable,
    className: 'form-input',
    disabled,
  };

  const handleTest = async () => {
    setTestState({ status: 'loading' });
    try {
      const env = environment || { id: '', name: '', variables: {} };
      const result = await getOAuth2AccessToken(
        value, env,
        (config) => window.electronAPI.executeHttpRequest(config),
        (t, e) => HttpService.replaceVariables(t, e),
        { forceRefresh: true },
      );
      const preview = result.accessToken.length > 12
        ? `${result.accessToken.slice(0, 6)}...${result.accessToken.slice(-4)}`
        : result.accessToken;
      const expiresInSec = Math.max(0, Math.round((result.expiresAt - Date.now()) / 1000));
      setTestState({ status: 'success', message: `Token acquired: ${preview} (expires in ~${expiresInSec}s)` });
    } catch (err: any) {
      setTestState({ status: 'error', message: err?.message || 'Failed to fetch token' });
    }
  };

  return (
    <>
      <div className="form-group">
        <label>Grant Type</label>
        <select
          className="form-input"
          value={value.grantType}
          disabled={disabled}
          onChange={(e) => update({ grantType: e.target.value as OAuth2Config['grantType'] })}
        >
          {Object.entries(GRANT_TYPE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Access Token URL</label>
        <VariableInput
          {...inputProps}
          value={value.accessTokenUrl || ''}
          onChange={(v) => update({ accessTokenUrl: v })}
          placeholder="https://auth.example.com/oauth/token"
        />
      </div>

      {value.grantType !== 'refresh_token' && (
        <>
          <div className="form-group">
            <label>Client ID</label>
            <VariableInput {...inputProps} value={value.clientId || ''} onChange={(v) => update({ clientId: v })} />
          </div>
          <div className="form-group">
            <label>Client Secret</label>
            <VariableInput {...inputProps} value={value.clientSecret || ''} onChange={(v) => update({ clientSecret: v })} />
          </div>
          <div className="form-group">
            <label>Send Client Credentials As</label>
            <select
              className="form-input"
              value={value.clientAuthentication || 'body'}
              disabled={disabled}
              onChange={(e) => update({ clientAuthentication: e.target.value as OAuth2Config['clientAuthentication'] })}
            >
              <option value="body">Request Body (client_id/client_secret fields)</option>
              <option value="basic">Basic Auth Header</option>
            </select>
          </div>
        </>
      )}

      {value.grantType === 'password' && (
        <>
          <div className="form-group">
            <label>Username</label>
            <VariableInput {...inputProps} value={value.username || ''} onChange={(v) => update({ username: v })} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <VariableInput {...inputProps} value={value.password || ''} onChange={(v) => update({ password: v })} />
          </div>
        </>
      )}

      {value.grantType === 'authorization_code' && (
        <>
          <div className="form-group">
            <label>Authorization Code</label>
            <VariableInput
              {...inputProps}
              value={value.authorizationCode || ''}
              onChange={(v) => update({ authorizationCode: v })}
              placeholder="Code obtained from the provider's consent screen"
            />
          </div>
          <div className="form-group">
            <label>Redirect URI</label>
            <VariableInput {...inputProps} value={value.redirectUri || ''} onChange={(v) => update({ redirectUri: v })} />
          </div>
        </>
      )}

      {value.grantType === 'refresh_token' && (
        <div className="form-group">
          <label>Refresh Token</label>
          <VariableInput {...inputProps} value={value.refreshToken || ''} onChange={(v) => update({ refreshToken: v })} />
        </div>
      )}

      {(value.grantType === 'client_credentials' || value.grantType === 'password') && (
        <div className="form-group">
          <label>Scope (optional)</label>
          <VariableInput {...inputProps} value={value.scope || ''} onChange={(v) => update({ scope: v })} placeholder="read write" />
        </div>
      )}

      <div className="form-group">
        <label>Header Prefix (optional)</label>
        <VariableInput
          {...inputProps}
          value={value.headerPrefix || ''}
          onChange={(v) => update({ headerPrefix: v })}
          placeholder="Bearer (default)"
        />
      </div>

      {!disabled && (
        <div className="form-group">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleTest}
            disabled={testState.status === 'loading' || !value.accessTokenUrl}
          >
            {testState.status === 'loading' ? 'Fetching token...' : 'Get Access Token'}
          </button>
          {testState.status === 'success' && (
            <div style={{ marginTop: '0.5rem', color: '#4ade80', fontSize: '0.85rem' }}>✓ {testState.message}</div>
          )}
          {testState.status === 'error' && (
            <div style={{ marginTop: '0.5rem', color: '#f87171', fontSize: '0.85rem' }}>✗ {testState.message}</div>
          )}
        </div>
      )}
    </>
  );
};
