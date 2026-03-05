import React, { useState, useEffect, useRef } from 'react';
import { ApiRequest, Environment, RequestHistoryEntry } from '../types';
import { KeyValueEditor } from './KeyValueEditor';
import { VariableInput } from './VariableInput';
import jsonlint from 'jsonlint-mod';

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#4ade80';
  if (status >= 300 && status < 400) return '#facc15';
  if (status >= 400) return '#f87171';
  return '#888';
}

interface RequestPanelProps {
  request: ApiRequest | null;
  environment: Environment | null;
  onExecute: (request: ApiRequest) => void;
  onRequestChange: (request: ApiRequest) => void;
  onUpdateVariable?: (varName: string, newValue: string) => void;
  isLoading: boolean;
  requestHistory?: RequestHistoryEntry[];
  isReadOnly?: boolean;
}

export const RequestPanel: React.FC<RequestPanelProps> = ({
  request,
  environment,
  onExecute,
  onRequestChange,
  onUpdateVariable,
  isLoading,
  requestHistory = [],
  isReadOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'auth' | 'scripts'>('headers');
  const [localRequest, setLocalRequest] = useState<ApiRequest | null>(null);
  const [jsonValidation, setJsonValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalRequest(request);
  }, [request]);

  // Debounced JSON validation
  const rawBody = localRequest?.body?.type === 'raw' ? (localRequest.body.data as string) : '';
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!rawBody || rawBody.trim() === '') {
      setJsonValidation(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      // Replace {{variables}} with placeholder strings before validating.
      // Also consume surrounding quotes if present, so "{{var}}" doesn't become ""__placeholder__""
      const sanitized = rawBody.replace(/"?\{\{\w+\}\}"?/g, '"__placeholder__"');

      try {
        jsonlint.parse(sanitized);
        setJsonValidation({ valid: true, message: 'Valid JSON' });
      } catch (err: any) {
        const msg = err.message || 'Invalid JSON';
        // Extract just the first line of the error for a compact display
        const firstLine = msg.split('\n')[0];
        setJsonValidation({ valid: false, message: firstLine });
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawBody]);

  if (!localRequest) {
    return (
      <div className="request-panel">
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          Select a request from the sidebar to get started
        </div>
      </div>
    );
  }

  const updateRequest = (updates: Partial<ApiRequest>) => {
    const updatedRequest = { ...localRequest, ...updates };
    setLocalRequest(updatedRequest);
    if (!isReadOnly) {
      onRequestChange(updatedRequest);
    }
  };

  const updateHeader = (key: string, value: string) => {
    const headers = { ...localRequest.headers };
    if (value.trim() === '') {
      delete headers[key];
    } else {
      headers[key] = value;
    }
    updateRequest({ headers });
  };

  const addHeader = () => {
    const headers = { ...localRequest.headers, '': '' };
    updateRequest({ headers });
  };

  return (
    <div className="request-panel">
      {isReadOnly && (
        <div style={{
          background: '#1a2d2d',
          borderBottom: '1px solid #0d7377',
          padding: '0.4rem 1rem',
          fontSize: '0.78rem',
          color: '#0d9e9e',
        }}>
          📌 Viewing saved request snapshot — changes will not be saved
        </div>
      )}
      <div className="url-bar">
        <select
          className="method-select"
          value={localRequest.method}
          onChange={(e) => updateRequest({ method: e.target.value as any })}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>

        <VariableInput
          value={localRequest.url}
          onChange={(value) => updateRequest({ url: value })}
          environment={environment}
          onUpdateVariable={onUpdateVariable}
          placeholder="Enter request URL"
          className="url-input"
        />

        <button
          className="send-button"
          onClick={() => onExecute(localRequest)}
          disabled={isLoading || !environment}
        >
          {isLoading ? '...' : 'Send'}
        </button>
        <button
          className={`button ${showHistory ? '' : 'button-secondary'}`}
          onClick={() => setShowHistory(!showHistory)}
          title="Request history"
          style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}
        >
          History
        </button>
      </div>

      {showHistory && (() => {
        const filtered = requestHistory
          .filter(h => h.requestId === localRequest.id)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #404040',
            borderRadius: '4px',
            marginBottom: '0.5rem',
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '1rem', color: '#666', textAlign: 'center', fontSize: '0.85rem' }}>
                No history for this request
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Method</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>URL</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Status</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Duration</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                      <td style={{ padding: '0.4rem 0.6rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(entry.timestamp)}
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>
                        <span style={{
                          color: '#e0e0e0',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                        }}>
                          {entry.method}
                        </span>
                      </td>
                      <td style={{
                        padding: '0.4rem 0.6rem',
                        color: '#ccc',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {entry.url}
                      </td>
                      <td style={{
                        padding: '0.4rem 0.6rem',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: statusColor(entry.status),
                      }}>
                        {entry.status || '---'}
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#aaa' }}>
                        {entry.time}ms
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#aaa' }}>
                        {formatSize(entry.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      <div className="request-tabs">
        <button
          className={`tab ${activeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        <button
          className={`tab ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </button>
        <button
          className={`tab ${activeTab === 'auth' ? 'active' : ''}`}
          onClick={() => setActiveTab('auth')}
        >
          Auth
        </button>
        <button
          className={`tab ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => setActiveTab('scripts')}
        >
          Scripts
        </button>
      </div>

      {activeTab === 'headers' && (
        <div>
          {Object.entries(localRequest.headers).map(([key, value], index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
              <input
                type="text"
                placeholder="Header name"
                value={key}
                onChange={(e) => {
                  const newHeaders = { ...localRequest.headers };
                  delete newHeaders[key];
                  newHeaders[e.target.value] = value;
                  updateRequest({ headers: newHeaders });
                }}
                className="form-input"
                style={{ flex: 1 }}
              />
              <VariableInput
                value={value}
                onChange={(val) => updateHeader(key, val)}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder="Header value"
                className="form-input"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => {
                  const newHeaders = { ...localRequest.headers };
                  delete newHeaders[key];
                  updateRequest({ headers: newHeaders });
                }}
                className="button-secondary button"
              >
                ✗
              </button>
            </div>
          ))}
          <button onClick={addHeader} className="button">
            + Add Header
          </button>
        </div>
      )}

      {activeTab === 'body' && (
        <div>
          <div className="form-group">
            <label>Body Type</label>
            <select
              className="form-input"
              value={localRequest.body?.type || 'raw'}
              onChange={(e) => {
                const type = e.target.value as 'raw' | 'form-data' | 'x-www-form-urlencoded';
                if (type === 'raw') {
                  updateRequest({
                    body: { type, data: localRequest.body?.data || '' }
                  });
                } else {
                  // Initialize with empty form data array
                  updateRequest({
                    body: {
                      type,
                      data: '',
                      formData: localRequest.body?.formData || []
                    }
                  });
                }
              }}
            >
              <option value="raw">Raw (JSON)</option>
              <option value="x-www-form-urlencoded">x-www-form-urlencoded</option>
              <option value="form-data">form-data</option>
            </select>
          </div>

          {localRequest.body?.type === 'raw' ? (
            <>
              <VariableInput
                value={typeof localRequest.body?.data === 'string' ? localRequest.body.data : ''}
                onChange={(value) => updateRequest({
                  body: {
                    type: 'raw',
                    data: value
                  }
                })}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder='{\n  "key": "value"\n}'
                className="form-textarea"
                style={{ minHeight: '200px' }}
                multiline={true}
              />
              {jsonValidation && (
                <div style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  color: jsonValidation.valid ? '#4ade80' : '#f87171',
                  backgroundColor: jsonValidation.valid ? 'rgba(74, 222, 128, 0.08)' : 'rgba(248, 113, 113, 0.08)',
                  borderRadius: '0 0 4px 4px',
                  marginTop: '-1px',
                }}>
                  {jsonValidation.valid ? '\u2713 ' : '\u2717 '}{jsonValidation.message}
                </div>
              )}
            </>
          ) : (
            <KeyValueEditor
              data={localRequest.body?.formData || []}
              onChange={(formData) => updateRequest({
                body: {
                  type: localRequest.body?.type || 'x-www-form-urlencoded',
                  data: '',
                  formData
                }
              })}
              placeholder={{ key: 'Parameter name', value: 'Parameter value' }}
              environment={environment}
              onUpdateVariable={onUpdateVariable}
              allowSecrets={true}
            />
          )}
        </div>
      )}

      {activeTab === 'auth' && (
        <div>
          <div className="form-group">
            <label>Authentication Type</label>
            <select
              className="form-input"
              value={localRequest.auth?.type || 'none'}
              onChange={(e) => {
                const type = e.target.value as any;
                updateRequest({
                  auth: type === 'none' ? undefined : { type }
                });
              }}
            >
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="jwt">JWT</option>
            </select>
          </div>

          {localRequest.auth?.type === 'bearer' && (
            <div className="form-group">
              <label>Bearer Token</label>
              <VariableInput
                value={localRequest.auth.bearer || ''}
                onChange={(value) => updateRequest({
                  auth: { type: 'bearer', bearer: value }
                })}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder="{{token}} or paste token here"
                className="form-input"
              />
            </div>
          )}

          {localRequest.auth?.type === 'basic' && (
            <>
              <div className="form-group">
                <label>Username</label>
                <VariableInput
                  value={localRequest.auth.basic?.username || ''}
                  onChange={(value) => updateRequest({
                    auth: {
                      type: 'basic',
                      basic: {
                        username: value,
                        password: localRequest.auth?.basic?.password || ''
                      }
                    }
                  })}
                  environment={environment}
                  onUpdateVariable={onUpdateVariable}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <VariableInput
                  value={localRequest.auth.basic?.password || ''}
                  onChange={(value) => updateRequest({
                    auth: {
                      type: 'basic',
                      basic: {
                        username: localRequest.auth?.basic?.username || '',
                        password: value
                      }
                    }
                  })}
                  environment={environment}
                  onUpdateVariable={onUpdateVariable}
                  className="form-input"
                />
              </div>
            </>
          )}

          {localRequest.auth?.type === 'jwt' && (
            <div className="form-group">
              <label>JWT Token</label>
              <VariableInput
                value={localRequest.auth.jwt || ''}
                onChange={(value) => updateRequest({
                  auth: { type: 'jwt', jwt: value }
                })}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder="{{jwt_token}} or paste JWT here"
                className="form-input"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'scripts' && (
        <div>
          <div className="form-group">
            <label>Pre-request Script</label>
            <textarea
              className="form-textarea"
              placeholder={`// Example: Set variables
pm.environment.set("timestamp", Date.now());
console.log("Request will execute with:", pm.environment.get("api_key"));`}
              value={localRequest.preRequestScript || ''}
              onChange={(e) => updateRequest({ preRequestScript: e.target.value })}
              style={{ minHeight: '150px' }}
            />
          </div>

          <div className="form-group">
            <label>Test Script</label>
            <textarea
              className="form-textarea"
              placeholder={`// Example: Test response and extract token
pm.test("Status code is 200", () => {
    pm.expect(pm.response.status).to.equal(200);
});

const response = pm.response.json();
if (response.access_token) {
    pm.environment.set("token", response.access_token);
    console.log("Token saved:", response.access_token);
}`}
              value={localRequest.testScript || ''}
              onChange={(e) => updateRequest({ testScript: e.target.value })}
              style={{ minHeight: '150px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};