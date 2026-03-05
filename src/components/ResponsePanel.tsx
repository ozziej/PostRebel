import React, { useState, useEffect } from 'react';
import { ApiResponse, SavedResponse } from '../types';

interface ResponsePanelProps {
  response: ApiResponse | null;
  logs: string[];
  isLoading: boolean;
  activeSavedResponse?: SavedResponse | null;
  onSaveResponse?: (name: string) => void;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  logs,
  isLoading,
  activeSavedResponse,
  onSaveResponse,
}) => {
  const [activeTab, setActiveTab] = useState<'response' | 'headers' | 'console'>('response');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveInputName, setSaveInputName] = useState('');

  useEffect(() => {
    setShowSaveInput(false);
    setSaveInputName('');
  }, [response]);

  const formatJsonResponse = (data: any): string => {
    try {
      if (typeof data === 'string') {
        // Try to parse if it's a JSON string
        try {
          return JSON.stringify(JSON.parse(data), null, 2);
        } catch {
          return data;
        }
      }
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const getStatusClass = (status: number): string => {
    if (status === 0) return 'status-500'; // Network errors
    if (status >= 200 && status < 300) return 'status-200';
    if (status >= 400 && status < 500) return 'status-400';
    if (status >= 500) return 'status-500';
    return '';
  };

  const isErrorResponse = (response: ApiResponse): boolean => {
    return response.status === 0 || response.status >= 400;
  };

  if (isLoading) {
    return (
      <div className="response-panel">
        <div className="response-header">
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            <div>Sending request...</div>
            <div style={{ marginTop: '1rem', fontSize: '2rem' }}>⏳</div>
          </div>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="response-panel">
        <div className="response-header">
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            Response will appear here after sending a request
          </div>
        </div>
      </div>
    );
  }

  const handleSaveConfirm = () => {
    if (!onSaveResponse || !saveInputName.trim()) return;
    onSaveResponse(saveInputName.trim());
    setSaveInputName('');
    setShowSaveInput(false);
  };

  return (
    <div className="response-panel">
      {activeSavedResponse && (
        <div style={{
          background: '#1a2d2d',
          borderBottom: '1px solid #0d7377',
          padding: '0.4rem 1rem',
          fontSize: '0.78rem',
          color: '#0d9e9e',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>📌</span>
          <span>Viewing saved response: <strong>{activeSavedResponse.name}</strong> — select a request to return to live mode</span>
        </div>
      )}
      <div className="response-header">
        <div className="response-stats" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`status-badge ${getStatusClass(response.status)}`}>
            {response.status === 0 ? '✗ ' : ''}{response.status > 0 ? response.status + ' ' : ''}{response.statusText}
          </span>
          {response.time > 0 && <span>{response.time}ms</span>}
          {response.size > 0 && <span>{response.size} bytes</span>}
          {onSaveResponse && !activeSavedResponse && (
            showSaveInput ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Response name..."
                  value={saveInputName}
                  onChange={(e) => setSaveInputName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveConfirm();
                    if (e.key === 'Escape') { setShowSaveInput(false); setSaveInputName(''); }
                  }}
                  style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', width: '160px' }}
                  autoFocus
                />
                <button
                  onClick={handleSaveConfirm}
                  className="button"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                  title="Confirm save"
                >✓</button>
                <button
                  onClick={() => { setShowSaveInput(false); setSaveInputName(''); }}
                  className="button-secondary button"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                  title="Cancel"
                >✗</button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="button-secondary button"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', marginLeft: 'auto' }}
                title="Save this response"
              >
                💾 Save
              </button>
            )
          )}
        </div>

        <div className="request-tabs" style={{ marginTop: '1rem' }}>
          <button
            className={`tab ${activeTab === 'response' ? 'active' : ''}`}
            onClick={() => setActiveTab('response')}
          >
            Response
          </button>
          <button
            className={`tab ${activeTab === 'headers' ? 'active' : ''}`}
            onClick={() => setActiveTab('headers')}
          >
            Headers
          </button>
          <button
            className={`tab ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            Console {logs.length > 0 && <span style={{ background: '#0d7377', borderRadius: '10px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', marginLeft: '0.5rem' }}>{logs.length}</span>}
          </button>
        </div>
      </div>

      <div className="response-content">
        {activeTab === 'response' && (
          <>
            {response.status === 0 && response.data?.error ? (
              <div style={{
                backgroundColor: '#3d1a1a',
                border: '2px solid #ef4444',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem', marginRight: '1rem' }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ef4444' }}>
                      {response.statusText}
                    </div>
                    <div style={{ fontSize: '1rem', color: '#cccccc', marginTop: '0.5rem' }}>
                      {response.data.message}
                    </div>
                  </div>
                </div>

                {response.data.troubleshooting && (
                  <details open style={{ marginTop: '1rem' }}>
                    <summary style={{
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      color: '#f59e0b',
                      marginBottom: '0.5rem',
                      userSelect: 'none'
                    }}>
                      🔍 Troubleshooting Information
                    </summary>
                    <div style={{
                      backgroundColor: '#2d2d2d',
                      padding: '1rem',
                      borderRadius: '4px',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      lineHeight: '1.6',
                      marginTop: '0.5rem',
                      border: '1px solid #404040'
                    }}>
                      {response.data.troubleshooting}
                    </div>
                  </details>
                )}

                {response.data.code && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.5rem',
                    backgroundColor: '#2d2d2d',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#888',
                    fontFamily: 'monospace'
                  }}>
                    <strong>Error Code:</strong> {response.data.code}
                  </div>
                )}
              </div>
            ) : isErrorResponse(response) ? (
              <div style={{
                backgroundColor: '#3d2a1a',
                border: '2px solid #f59e0b',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem' }}>
                  ⚠️ HTTP Error {response.status}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#cccccc' }}>
                  The server returned an error response. See details below.
                </div>
              </div>
            ) : null}

            <div className="response-json">
              {formatJsonResponse(response.data)}
            </div>
          </>
        )}

        {activeTab === 'headers' && (
          <div>
            {Object.entries(response.headers).map(([key, value]) => (
              <div key={key} style={{ margin: '0.5rem 0', display: 'flex' }}>
                <strong style={{ minWidth: '200px', color: '#0d7377' }}>{key}:</strong>
                <span style={{ marginLeft: '1rem', wordBreak: 'break-all' }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'console' && (
          <div className="logs">
            {logs.length === 0 ? (
              <div style={{ color: '#666', fontStyle: 'italic' }}>
                No console output
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">
                  <span style={{ color: '#888', marginRight: '0.5rem' }}>
                    [{new Date().toLocaleTimeString()}]
                  </span>
                  {log}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};