import React, { useState, useEffect, useCallback } from 'react';
import { ApiRequest, Collection, Environment, EnvironmentVariable, Workspace } from '../types';

interface VariableRow {
  name: string;
  currentValue: string;
  isSecret: boolean;
  existsInTarget: boolean;
  include: boolean;
}

interface Props {
  request: ApiRequest;
  sourceWorkspaceId: string | undefined;
  sourceEnvironments: Environment[];
  activeEnvironment: Environment | null;
  onClose: () => void;
}

function extractVariableNames(request: ApiRequest): string[] {
  const pattern = /\{\{([^}]+)\}\}/g;
  const found = new Set<string>();
  const scan = (text: string | undefined) => {
    if (!text) return;
    let m: RegExpExecArray | null;
    const re = /\{\{([^}]+)\}\}/g;
    while ((m = re.exec(text)) !== null) found.add(m[1].trim());
  };
  scan(request.url);
  Object.entries(request.headers).forEach(([k, v]) => { scan(k); scan(v); });
  if (typeof request.body?.data === 'string') scan(request.body.data);
  request.body?.formData?.forEach(p => { scan(p.key); scan(p.value); });
  scan(request.preRequestScript);
  scan(request.testScript);
  scan(request.auth?.bearer);
  scan(request.auth?.basic?.username);
  scan(request.auth?.basic?.password);
  scan(request.auth?.jwt);
  return Array.from(found);
}

function resolveCurrentValues(
  varNames: string[],
  sourceEnvironments: Environment[],
  activeEnvironment: Environment | null,
): Map<string, { value: string; isSecret: boolean }> {
  const result = new Map<string, { value: string; isSecret: boolean }>();
  // Build a merged lookup across all source environments, preferring the active one
  const envOrder = activeEnvironment
    ? [activeEnvironment, ...sourceEnvironments.filter(e => e.id !== activeEnvironment.id)]
    : sourceEnvironments;

  for (const name of varNames) {
    let found = false;
    for (const env of envOrder) {
      if (env.variablesArray) {
        const v = env.variablesArray.find(v => v.key === name);
        if (v) { result.set(name, { value: v.value, isSecret: v.isSecret }); found = true; break; }
      }
      if (!found && env.variables?.[name] !== undefined) {
        result.set(name, { value: env.variables[name], isSecret: false });
        found = true; break;
      }
    }
    if (!found) result.set(name, { value: '', isSecret: false });
  }
  return result;
}

type CollectionChoice = 'existing' | 'new';
type EnvChoice = 'existing' | 'new' | 'none';

export const CopyToWorkspaceModal: React.FC<Props> = ({
  request,
  sourceWorkspaceId,
  sourceEnvironments,
  activeEnvironment,
  onClose,
}) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');
  const [targetCollections, setTargetCollections] = useState<Collection[]>([]);
  const [targetEnvironments, setTargetEnvironments] = useState<Environment[]>([]);
  const [collectionChoice, setCollectionChoice] = useState<CollectionChoice>('existing');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [envChoice, setEnvChoice] = useState<EnvChoice>('existing');
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');
  const [newEnvName, setNewEnvName] = useState('');
  const [variableRows, setVariableRows] = useState<VariableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load workspaces on mount
  useEffect(() => {
    window.electronAPI.loadWorkspaces().then(r => {
      if (r.success) {
        const others = r.workspaces.filter(w => w.id !== sourceWorkspaceId);
        setWorkspaces(others);
        if (others.length > 0) setTargetWorkspaceId(others[0].id);
      }
    });
  }, [sourceWorkspaceId]);

  // Load target workspace data whenever workspace selection changes
  useEffect(() => {
    if (!targetWorkspaceId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      window.electronAPI.loadCollections(targetWorkspaceId),
      window.electronAPI.loadEnvironments(targetWorkspaceId),
    ]).then(([colResult, envResult]) => {
      const cols = colResult.success ? colResult.collections : [];
      const envs = envResult.success ? envResult.environments : [];
      setTargetCollections(cols);
      setTargetEnvironments(envs);
      setSelectedCollectionId(cols.length > 0 ? cols[0].id : '');
      setCollectionChoice(cols.length > 0 ? 'existing' : 'new');
      setSelectedEnvId(envs.length > 0 ? envs[0].id : '');
      setEnvChoice(envs.length > 0 ? 'existing' : (extractVariableNames(request).length > 0 ? 'new' : 'none'));
      setLoading(false);
    });
  }, [targetWorkspaceId]);

  // Build variable rows whenever target environments change
  useEffect(() => {
    const names = extractVariableNames(request);
    if (names.length === 0) { setVariableRows([]); return; }
    const currentValues = resolveCurrentValues(names, sourceEnvironments, activeEnvironment);

    // Check which variables exist in all target environments combined
    const targetVarKeys = new Set<string>();
    targetEnvironments.forEach(env => {
      env.variablesArray?.forEach(v => targetVarKeys.add(v.key));
      Object.keys(env.variables || {}).forEach(k => targetVarKeys.add(k));
    });

    setVariableRows(names.map(name => {
      const cur = currentValues.get(name) ?? { value: '', isSecret: false };
      return {
        name,
        currentValue: cur.value,
        isSecret: cur.isSecret,
        existsInTarget: targetVarKeys.has(name),
        include: !targetVarKeys.has(name), // default: include only missing vars
      };
    }));
  }, [request, targetEnvironments, sourceEnvironments, activeEnvironment]);

  const toggleVar = useCallback((name: string) => {
    setVariableRows(rows => rows.map(r => r.name === name ? { ...r, include: !r.include } : r));
  }, []);

  const anyVarsIncluded = variableRows.some(r => r.include);

  const handleCopy = async () => {
    if (!targetWorkspaceId) return;
    setSaving(true);
    setError(null);
    try {
      // 1. Determine or build the target collection
      let targetCollection: Collection;
      if (collectionChoice === 'new') {
        const name = newCollectionName.trim() || `${request.name} Collection`;
        targetCollection = {
          id: `col-${Date.now()}`,
          name,
          requests: [],
          folders: [],
        };
      } else {
        const found = targetCollections.find(c => c.id === selectedCollectionId);
        if (!found) throw new Error('Selected collection not found');
        targetCollection = { ...found };
      }

      // 2. Add the request with a new ID
      const newRequest: ApiRequest = { ...request, id: `req-${Date.now()}` };
      targetCollection = { ...targetCollection, requests: [...targetCollection.requests, newRequest] };

      const saveColResult = await window.electronAPI.saveCollection(targetWorkspaceId, targetCollection);
      if (!saveColResult.success) throw new Error(saveColResult.error ?? 'Failed to save collection');

      // 3. Copy variables if any are included
      if (anyVarsIncluded) {
        const varsToInclude = variableRows.filter(r => r.include);
        let targetEnv: Environment;

        if (envChoice === 'new') {
          const name = newEnvName.trim() || `${activeEnvironment?.name ?? 'Copied'} Variables`;
          targetEnv = {
            id: `env-${Date.now()}`,
            name,
            variables: {},
            variablesArray: [],
          };
        } else {
          const found = targetEnvironments.find(e => e.id === selectedEnvId);
          if (!found) throw new Error('Selected environment not found');
          targetEnv = {
            ...found,
            variablesArray: found.variablesArray ? [...found.variablesArray] : [],
            variables: { ...found.variables },
          };
        }

        // Merge variables (don't overwrite existing)
        for (const row of varsToInclude) {
          const alreadyInEnv = targetEnv.variablesArray?.some(v => v.key === row.name);
          if (!alreadyInEnv) {
            targetEnv.variablesArray = [
              ...(targetEnv.variablesArray ?? []),
              { key: row.name, value: row.currentValue, isSecret: row.isSecret },
            ];
          }
        }

        const saveEnvResult = await window.electronAPI.saveEnvironment(targetWorkspaceId, targetEnv);
        if (!saveEnvResult.success) throw new Error(saveEnvResult.error ?? 'Failed to save environment');
      }

      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const targetWorkspaceName = workspaces.find(w => w.id === targetWorkspaceId)?.name ?? '';
  const varNames = extractVariableNames(request);

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  };
  const modal: React.CSSProperties = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
    width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };
  const header: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1rem 1.25rem', borderBottom: '1px solid #333',
  };
  const body: React.CSSProperties = {
    padding: '1.25rem', overflowY: 'auto', flex: 1,
  };
  const footer: React.CSSProperties = {
    padding: '0.85rem 1.25rem', borderTop: '1px solid #333',
    display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '0.3rem',
  };
  const section: React.CSSProperties = { marginBottom: '1.1rem' };
  const radioRow: React.CSSProperties = { display: 'flex', gap: '1rem', marginBottom: '0.5rem' };
  const radioLabel: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    fontSize: '0.82rem', color: '#ccc', cursor: 'pointer',
  };

  if (workspaces.length === 0 && !loading) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modal, width: 380 }} onClick={e => e.stopPropagation()}>
          <div style={header}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Copy to Workspace</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>
          <div style={body}>
            <p style={{ color: '#aaa', fontSize: '0.85rem' }}>No other workspaces found. Create another workspace first.</p>
          </div>
          <div style={footer}>
            <button onClick={onClose} className="button-secondary button">Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modal, width: 380 }} onClick={e => e.stopPropagation()}>
          <div style={header}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Copied</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
          </div>
          <div style={{ ...body, textAlign: 'center', padding: '2rem 1.25rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✓</div>
            <p style={{ color: '#e0e0e0', fontSize: '0.9rem', margin: 0 }}>
              <strong>{request.name}</strong> copied to <strong>{targetWorkspaceName}</strong>
            </p>
          </div>
          <div style={footer}>
            <button onClick={onClose} className="button">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Copy to Workspace</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>

        <div style={body}>
          {/* Request info */}
          <div style={{ ...section, padding: '0.6rem 0.85rem', background: '#252525', borderRadius: 6, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className={`http-method ${request.method}`}>{request.method}</span>
            <span style={{ fontSize: '0.85rem', color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.name}</span>
          </div>

          {/* Target workspace */}
          <div style={section}>
            <label style={label}>Target Workspace</label>
            <select
              className="form-input"
              value={targetWorkspaceId}
              onChange={e => setTargetWorkspaceId(e.target.value)}
              style={{ width: '100%' }}
              disabled={loading}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {loading && <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: '1rem' }}>Loading workspace data…</div>}

          {!loading && (
            <>
              {/* Target collection */}
              <div style={section}>
                <label style={label}>Add to Collection</label>
                <div style={radioRow}>
                  {targetCollections.length > 0 && (
                    <label style={radioLabel}>
                      <input type="radio" checked={collectionChoice === 'existing'} onChange={() => setCollectionChoice('existing')} />
                      Existing collection
                    </label>
                  )}
                  <label style={radioLabel}>
                    <input type="radio" checked={collectionChoice === 'new'} onChange={() => setCollectionChoice('new')} />
                    New collection
                  </label>
                </div>
                {collectionChoice === 'existing' && targetCollections.length > 0 && (
                  <select
                    className="form-input"
                    value={selectedCollectionId}
                    onChange={e => setSelectedCollectionId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {targetCollections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {collectionChoice === 'new' && (
                  <input
                    className="form-input"
                    type="text"
                    placeholder={`${request.name} Collection`}
                    value={newCollectionName}
                    onChange={e => setNewCollectionName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                )}
              </div>

              {/* Variables */}
              {varNames.length > 0 && (
                <div style={section}>
                  <label style={{ ...label, marginBottom: '0.5rem' }}>
                    Referenced Variables ({varNames.length} found)
                  </label>
                  <div style={{ border: '1px solid #333', borderRadius: 6, overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 0, background: '#252525', padding: '0.4rem 0.75rem', borderBottom: '1px solid #333' }}>
                      <span style={{ fontSize: '0.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variable</span>
                      <span style={{ fontSize: '0.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Value</span>
                      <span style={{ fontSize: '0.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Copy</span>
                    </div>
                    {variableRows.map(row => (
                      <div
                        key={row.name}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                          gap: 0, padding: '0.45rem 0.75rem', alignItems: 'center',
                          borderBottom: '1px solid #2a2a2a',
                          background: row.existsInTarget ? '#1a1a1a' : 'transparent',
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', color: '#a78bfa', fontFamily: 'monospace' }}>
                          {`{{${row.name}}}`}
                          {row.existsInTarget && <span style={{ fontSize: '0.7rem', color: '#666', marginLeft: 6 }}>exists</span>}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: row.currentValue ? '#e0e0e0' : '#555', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.currentValue ? (row.isSecret ? '••••••••' : row.currentValue) : '—'}
                        </span>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={() => toggleVar(row.name)}
                          style={{ cursor: 'pointer', accentColor: '#0d9e9e' }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Environment selector for variables */}
                  {anyVarsIncluded && (
                    <div style={{ marginTop: '0.85rem' }}>
                      <label style={label}>Copy variables to environment</label>
                      <div style={radioRow}>
                        {targetEnvironments.length > 0 && (
                          <label style={radioLabel}>
                            <input type="radio" checked={envChoice === 'existing'} onChange={() => setEnvChoice('existing')} />
                            Existing environment
                          </label>
                        )}
                        <label style={radioLabel}>
                          <input type="radio" checked={envChoice === 'new'} onChange={() => setEnvChoice('new')} />
                          New environment
                        </label>
                      </div>
                      {envChoice === 'existing' && targetEnvironments.length > 0 && (
                        <select
                          className="form-input"
                          value={selectedEnvId}
                          onChange={e => setSelectedEnvId(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          {targetEnvironments.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      )}
                      {envChoice === 'new' && (
                        <input
                          className="form-input"
                          type="text"
                          placeholder={`${activeEnvironment?.name ?? 'Copied'} Variables`}
                          value={newEnvName}
                          onChange={e => setNewEnvName(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      )}
                      <p style={{ fontSize: '0.75rem', color: '#666', margin: '0.4rem 0 0' }}>
                        Variables already present in the target environment will not be overwritten.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{ padding: '0.6rem 0.85rem', background: '#3a1a1a', border: '1px solid #8b2020', borderRadius: 6, color: '#f87171', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}
        </div>

        <div style={footer}>
          <button onClick={onClose} className="button-secondary button" disabled={saving}>Cancel</button>
          <button
            onClick={handleCopy}
            className="button"
            disabled={saving || loading || !targetWorkspaceId}
          >
            {saving ? 'Copying…' : 'Copy Request'}
          </button>
        </div>
      </div>
    </div>
  );
};
