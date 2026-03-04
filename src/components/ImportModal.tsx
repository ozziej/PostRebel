import React, { useState } from 'react';
import { Collection, Environment, ApiRequest } from '../types';
import { importPostmanCollection, importPostmanEnvironment } from '../utils/postmanImporter';
import { parseCurl } from '../utils/curlParser';

export type ImportTab = 'collection' | 'environment' | 'curl';

interface ImportModalProps {
  isOpen: boolean;
  initialTab?: ImportTab;
  collections: Collection[];
  onClose: () => void;
  onImportCollection: (collection: Collection, collectionVariables?: Environment) => void;
  onImportEnvironment: (environment: Environment) => void;
  onImportCurl: (request: ApiRequest, collectionId: string | null, newCollectionName?: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  initialTab = 'collection',
  collections,
  onClose,
  onImportCollection,
  onImportEnvironment,
  onImportCurl,
}) => {
  const [activeTab, setActiveTab] = useState<ImportTab>(initialTab);
  const [jsonInput, setJsonInput] = useState('');
  const [curlInput, setCurlInput] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState('');
  const [curlRequestName, setCurlRequestName] = useState('');
  const [curlTargetCollection, setCurlTargetCollection] = useState('__new__');
  const [curlNewCollectionName, setCurlNewCollectionName] = useState('');

  // Reset when tab changes
  const switchTab = (tab: ImportTab) => {
    setActiveTab(tab);
    setJsonInput('');
    setCurlInput('');
    setPreview(null);
    setErrors([]);
    setParseError('');
    setCurlRequestName('');
    setCurlTargetCollection('__new__');
    setCurlNewCollectionName('');
  };

  // Reset when modal opens with a new tab
  React.useEffect(() => {
    if (isOpen) {
      switchTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleSelectFile = async () => {
    try {
      const result = await window.electronAPI.selectJsonFile();
      if (result.success && result.content) {
        setJsonInput(result.content);
        if (activeTab === 'collection') {
          parseCollection(result.content);
        } else {
          parseEnvironment(result.content);
        }
      }
    } catch (e: any) {
      setParseError(e.message || 'Failed to read file');
    }
  };

  const parseCollection = (input: string) => {
    setParseError('');
    setPreview(null);
    setErrors([]);

    if (!input.trim()) return;

    try {
      const result = importPostmanCollection(input);
      setPreview(result);
      setErrors(result.errors);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  const parseEnvironment = (input: string) => {
    setParseError('');
    setPreview(null);
    setErrors([]);

    if (!input.trim()) return;

    try {
      const result = importPostmanEnvironment(input);
      setPreview(result);
      setErrors(result.errors);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  const parseCurlInput = (input: string) => {
    setParseError('');
    setPreview(null);
    setErrors([]);

    if (!input.trim()) return;

    try {
      const result = parseCurl(input);
      setPreview(result);
      setErrors(result.errors);
      setCurlRequestName(result.request.name);
      setCurlNewCollectionName(result.request.name);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  const handleImport = () => {
    if (!preview) return;

    if (activeTab === 'collection') {
      onImportCollection(preview.collection, preview.collectionVariables);
      onClose();
    } else if (activeTab === 'environment') {
      onImportEnvironment(preview.environment);
      onClose();
    } else if (activeTab === 'curl') {
      const request = { ...preview.request, name: curlRequestName || preview.request.name };
      const targetId = curlTargetCollection === '__new__' ? null : curlTargetCollection;
      onImportCurl(request, targetId, curlNewCollectionName);
      onClose();
    }
  };

  const tabStyle = (tab: ImportTab): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    background: activeTab === tab ? '#0d7377' : 'none',
    border: 'none',
    color: activeTab === tab ? '#ffffff' : '#cccccc',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    fontSize: '0.9rem',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: '#2d2d2d',
        padding: '2rem',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '700px',
        maxHeight: '85vh',
        overflow: 'auto',
        border: '1px solid #404040',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <h2 style={{ margin: 0 }}>Import</h2>
          <button onClick={onClose} className="button-secondary button">
            ✗
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '1px solid #404040',
          marginBottom: '1.5rem',
        }}>
          <button style={tabStyle('collection')} onClick={() => switchTab('collection')}>
            Postman Collection
          </button>
          <button style={tabStyle('environment')} onClick={() => switchTab('environment')}>
            Postman Environment
          </button>
          <button style={tabStyle('curl')} onClick={() => switchTab('curl')}>
            Curl Command
          </button>
        </div>

        {/* Collection Tab */}
        {activeTab === 'collection' && (
          <div>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0 }}>
              Import a Postman v2.0/v2.1 collection JSON file. All requests, headers, body, auth, and scripts will be preserved.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button className="button" onClick={handleSelectFile}>
                Choose File...
              </button>
              <span style={{ color: '#888', fontSize: '0.85rem', alignSelf: 'center' }}>
                or paste JSON below
              </span>
            </div>

            <textarea
              className="form-textarea"
              style={{ minHeight: '150px', fontFamily: "'Monaco', 'Menlo', monospace", fontSize: '0.8rem' }}
              placeholder='Paste Postman collection JSON here...'
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                parseCollection(e.target.value);
              }}
            />

            {/* Preview */}
            {preview && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#1a2d2d',
                border: '1px solid #0d7377',
                borderRadius: '4px',
              }}>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {preview.collection.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#888' }}>
                  {preview.collection.requests.length} request{preview.collection.requests.length !== 1 ? 's' : ''}
                  {preview.collectionVariables && (
                    <span> + {Object.keys(preview.collectionVariables.variables).length} collection variable{Object.keys(preview.collectionVariables.variables).length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {preview.collection.requests.length > 0 && (
                  <div style={{ marginTop: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {preview.collection.requests.map((r: any, i: number) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#aaa', padding: '0.15rem 0', display: 'flex', gap: '0.5rem' }}>
                        <span style={{
                          color: r.method === 'GET' ? '#4ade80' : r.method === 'POST' ? '#3b82f6' : r.method === 'PUT' ? '#f59e0b' : r.method === 'DELETE' ? '#ef4444' : '#8b5cf6',
                          fontWeight: 'bold',
                          minWidth: '50px',
                          fontSize: '0.75rem',
                        }}>
                          {r.method}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Environment Tab */}
        {activeTab === 'environment' && (
          <div>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0 }}>
              Import a Postman environment JSON file. Variables and secret flags will be preserved.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button className="button" onClick={handleSelectFile}>
                Choose File...
              </button>
              <span style={{ color: '#888', fontSize: '0.85rem', alignSelf: 'center' }}>
                or paste JSON below
              </span>
            </div>

            <textarea
              className="form-textarea"
              style={{ minHeight: '150px', fontFamily: "'Monaco', 'Menlo', monospace", fontSize: '0.8rem' }}
              placeholder='Paste Postman environment JSON here...'
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                parseEnvironment(e.target.value);
              }}
            />

            {/* Preview */}
            {preview && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#1a2d2d',
                border: '1px solid #0d7377',
                borderRadius: '4px',
              }}>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {preview.environment.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#888' }}>
                  {(preview.environment.variablesArray || []).length} variable{(preview.environment.variablesArray || []).length !== 1 ? 's' : ''}
                  {(preview.environment.variablesArray || []).some((v: any) => v.isSecret) && (
                    <span> (includes secrets)</span>
                  )}
                </div>
                {(preview.environment.variablesArray || []).length > 0 && (
                  <div style={{ marginTop: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {(preview.environment.variablesArray || []).map((v: any, i: number) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#aaa', padding: '0.15rem 0', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 'bold', color: '#cccccc' }}>{v.key}</span>
                        <span style={{ color: '#666' }}>=</span>
                        <span>{v.isSecret ? '••••••' : v.value || '(empty)'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Curl Tab */}
        {activeTab === 'curl' && (
          <div>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0 }}>
              Paste a curl command (e.g. from browser DevTools "Copy as cURL") to create a request.
            </p>

            <textarea
              className="form-textarea"
              style={{ minHeight: '150px', fontFamily: "'Monaco', 'Menlo', monospace", fontSize: '0.8rem' }}
              placeholder="curl -X POST https://api.example.com/data -H 'Content-Type: application/json' -d '{&quot;key&quot;:&quot;value&quot;}'"
              value={curlInput}
              onChange={(e) => {
                setCurlInput(e.target.value);
                parseCurlInput(e.target.value);
              }}
            />

            {/* Preview */}
            {preview && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#1a2d2d',
                border: '1px solid #0d7377',
                borderRadius: '4px',
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    backgroundColor:
                      preview.request.method === 'GET' ? '#4ade80' :
                      preview.request.method === 'POST' ? '#3b82f6' :
                      preview.request.method === 'PUT' ? '#f59e0b' :
                      preview.request.method === 'DELETE' ? '#ef4444' : '#8b5cf6',
                    color: ['GET', 'PUT'].includes(preview.request.method) ? '#000' : '#fff',
                  }}>
                    {preview.request.method}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview.request.url}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>
                  {Object.keys(preview.request.headers).length > 0 && (
                    <span>{Object.keys(preview.request.headers).length} header{Object.keys(preview.request.headers).length !== 1 ? 's' : ''}</span>
                  )}
                  {preview.request.body && (
                    <span>{Object.keys(preview.request.headers).length > 0 ? ' | ' : ''}Body: {preview.request.body.type}</span>
                  )}
                  {preview.request.auth && preview.request.auth.type !== 'none' && (
                    <span> | Auth: {preview.request.auth.type}</span>
                  )}
                </div>

                {/* Request name */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.25rem' }}>
                    Request name
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={curlRequestName}
                    onChange={(e) => setCurlRequestName(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Target collection */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.25rem' }}>
                    Add to collection
                  </label>
                  <select
                    className="form-input"
                    value={curlTargetCollection}
                    onChange={(e) => setCurlTargetCollection(e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  >
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="__new__">+ New collection</option>
                  </select>
                </div>

                {/* New collection name */}
                {curlTargetCollection === '__new__' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.25rem' }}>
                      New collection name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={curlNewCollectionName}
                      onChange={(e) => setCurlNewCollectionName(e.target.value)}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Errors / Warnings */}
        {parseError && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: '#3d1a1a',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#ef4444',
          }}>
            {parseError}
          </div>
        )}

        {errors.length > 0 && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: '#3d2a1a',
            border: '1px solid #f59e0b',
            borderRadius: '4px',
            fontSize: '0.8rem',
            color: '#f59e0b',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Warnings:</div>
            {errors.map((e, i) => (
              <div key={i} style={{ padding: '0.1rem 0' }}>- {e}</div>
            ))}
          </div>
        )}

        {/* Import Button */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button className="button-secondary button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button"
            onClick={handleImport}
            disabled={!preview || !!parseError}
            style={{ opacity: (!preview || !!parseError) ? 0.5 : 1 }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};
