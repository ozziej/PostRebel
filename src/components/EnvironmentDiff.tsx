import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Environment, EnvironmentVariable } from '../types';

interface EnvironmentDiffProps {
  environments: Environment[];
  initialEnvA: Environment | null;
  onClose: () => void;
  onSaveEnvironment?: (env: Environment) => Promise<any>;
}

interface DiffRow {
  key: string;
  valueA: string | null;
  isSecretA: boolean;
  valueB: string | null;
  isSecretB: boolean;
  status: 'same' | 'different' | 'only-a' | 'only-b';
}

export const EnvironmentDiff: React.FC<EnvironmentDiffProps> = ({
  environments,
  initialEnvA,
  onClose,
  onSaveEnvironment,
}) => {
  const [envAId, setEnvAId] = useState<string>(initialEnvA?.id ?? '');
  const [envBId, setEnvBId] = useState<string>(() => {
    const other = environments.find(e => e.id !== initialEnvA?.id);
    return other?.id ?? '';
  });
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);
  const [pendingEditsB, setPendingEditsB] = useState<Record<string, string>>({});
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2000);
  }, []);

  const getVariableInfo = (env: Environment, key: string): { value: string | null; isSecret: boolean } => {
    if (env.variablesArray) {
      const v = env.variablesArray.find(v => v.key === key);
      if (v) return { value: v.value, isSecret: v.isSecret };
    }
    if (env.variables && key in env.variables) {
      return { value: env.variables[key], isSecret: false };
    }
    return { value: null, isSecret: false };
  };

  const envA = environments.find(e => e.id === envAId);
  const envB = environments.find(e => e.id === envBId);

  // All rows (not filtered) — used for stats and copy logic
  const allRows = useMemo((): DiffRow[] => {
    if (!envA || !envB) return [];

    const keysSet = new Set<string>();
    (envA.variablesArray ? envA.variablesArray.map(v => v.key) : Object.keys(envA.variables))
      .forEach(k => keysSet.add(k));
    (envB.variablesArray ? envB.variablesArray.map(v => v.key) : Object.keys(envB.variables))
      .forEach(k => keysSet.add(k));
    // Include keys that only exist as pending edits
    Object.keys(pendingEditsB).forEach(k => keysSet.add(k));

    const rows: DiffRow[] = Array.from(keysSet).map(key => {
      const infoA = getVariableInfo(envA, key);
      const effectiveValueB = key in pendingEditsB ? pendingEditsB[key] : getVariableInfo(envB, key).value;
      const infoB = getVariableInfo(envB, key);

      let status: DiffRow['status'];
      if (infoA.value === null && effectiveValueB !== null) status = 'only-b';
      else if (infoA.value !== null && effectiveValueB === null) status = 'only-a';
      else if (infoA.value !== effectiveValueB) status = 'different';
      else status = 'same';

      return {
        key,
        valueA: infoA.value,
        isSecretA: infoA.isSecret,
        valueB: effectiveValueB,
        isSecretB: key in pendingEditsB ? false : infoB.isSecret,
        status,
      };
    });

    const order = { different: 0, 'only-a': 1, 'only-b': 2, same: 3 };
    rows.sort((a, b) => {
      const d = order[a.status] - order[b.status];
      return d !== 0 ? d : a.key.localeCompare(b.key);
    });
    return rows;
  }, [environments, envAId, envBId, pendingEditsB]);

  const displayRows = useMemo(
    () => showOnlyDiffs ? allRows.filter(r => r.status !== 'same') : allRows,
    [allRows, showOnlyDiffs],
  );

  const stats = useMemo(() => ({
    different: allRows.filter(r => r.status === 'different').length,
    onlyA: allRows.filter(r => r.status === 'only-a').length,
    onlyB: allRows.filter(r => r.status === 'only-b').length,
    identical: allRows.filter(r => r.status === 'same').length,
  }), [allRows]);

  const hasPendingChanges = Object.keys(pendingEditsB).length > 0;

  const handleCopyAtoB = (key: string, value: string) => {
    setPendingEditsB(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveToB = async () => {
    if (!envB || !onSaveEnvironment) return;
    setIsSaving(true);
    try {
      const base: EnvironmentVariable[] = envB.variablesArray
        ? envB.variablesArray.map(v => ({ ...v }))
        : Object.entries(envB.variables).map(([key, value]) => ({ key, value, isSecret: false }));

      for (const [key, value] of Object.entries(pendingEditsB)) {
        const existing = base.find(v => v.key === key);
        if (existing) {
          existing.value = value;
        } else {
          base.push({ key, value, isSecret: false });
        }
      }

      const variables: Record<string, string> = {};
      base.forEach(v => { variables[v.key] = v.value; });

      await onSaveEnvironment({ ...envB, variables, variablesArray: base });
      setPendingEditsB({});
      triggerToast(`Saved to ${envB.name}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatValue = (value: string | null, isSecret: boolean): string => {
    if (value === null) return '— not set —';
    if (isSecret) return '••••••••';
    return value.length > 72 ? value.slice(0, 72) + '…' : value;
  };

  const countVars = (env: Environment) =>
    env.variablesArray ? env.variablesArray.length : Object.keys(env.variables).length;

  const rowBg = (idx: number) => idx % 2 === 0 ? '#111' : '#151515';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: '#2d2d2d',
        padding: '2rem',
        borderRadius: '8px',
        width: '94%',
        maxWidth: '960px',
        maxHeight: '88vh',
        overflow: 'hidden',
        border: '1px solid #404040',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>Environment Diff</h2>
          <button onClick={onClose} className="button-secondary button">✗</button>
        </div>

        {/* Env selectors */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
          <select value={envAId} onChange={e => { setEnvAId(e.target.value); setPendingEditsB({}); }}
            className="form-input" style={{ flex: 1 }}>
            <option value="">Select environment A…</option>
            {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span style={{ color: '#555', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>⇄</span>
          <select value={envBId} onChange={e => { setEnvBId(e.target.value); setPendingEditsB({}); }}
            className="form-input" style={{ flex: 1 }}>
            <option value="">Select environment B…</option>
            {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {envA && envB ? (
          <>
            {/* Stats + controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', color: '#888', flex: 1, flexWrap: 'wrap' }}>
                {stats.different > 0 && <span style={{ color: '#f59e0b' }}>⬤ {stats.different} different</span>}
                {stats.onlyA > 0 && <span style={{ color: '#60a5fa' }}>⬤ {stats.onlyA} only in {envA.name}</span>}
                {stats.onlyB > 0 && <span style={{ color: '#818cf8' }}>⬤ {stats.onlyB} only in {envB.name}</span>}
                {stats.identical > 0 && <span>{stats.identical} identical</span>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: '#aaa', flexShrink: 0 }}>
                <input type="checkbox" checked={showOnlyDiffs} onChange={e => setShowOnlyDiffs(e.target.checked)} />
                Differences only
              </label>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #2a2a2a', borderRadius: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '37%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '37%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#1a1a1a', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #333', fontSize: '0.78rem', color: '#888', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Key</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #333', fontSize: '0.85rem', color: '#ccc', fontWeight: 600 }}>{envA.name} <span style={{ color: '#555', fontWeight: 400, fontSize: '0.78rem' }}>({countVars(envA)})</span></th>
                    <th style={{ padding: '0.6rem 0', textAlign: 'center', borderBottom: '2px solid #333' }}></th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '2px solid #333', fontSize: '0.85rem', color: '#ccc', fontWeight: 600 }}>{envB.name} <span style={{ color: '#555', fontWeight: 400, fontSize: '0.78rem' }}>({countVars(envB)})</span></th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '2.5rem', textAlign: 'center', color: '#555', fontSize: '0.9rem' }}>
                        {showOnlyDiffs ? 'No differences — environments are identical' : 'No variables in either environment'}
                      </td>
                    </tr>
                  ) : displayRows.map((row, idx) => {
                    const isPending = row.key in pendingEditsB;
                    const isHovered = hoveredRowKey === row.key;

                    const rowStyle: React.CSSProperties = {
                      backgroundColor: rowBg(idx),
                      borderBottom: '1px solid #1a1a1a',
                      borderLeft: row.status === 'different' ? '3px solid #f59e0b'
                        : row.status === 'only-a' ? '3px solid #60a5fa'
                        : row.status === 'only-b' ? '3px solid #818cf8'
                        : '3px solid transparent',
                    };

                    const valueColorA = row.status === 'different' ? '#f59e0b'
                      : row.valueA === null ? '#444'
                      : row.isSecretA ? '#555' : '#ddd';

                    const valueColorB = isPending ? '#0d9e9e'
                      : row.status === 'different' ? '#f59e0b'
                      : row.valueB === null ? '#444'
                      : row.isSecretB ? '#555' : '#ddd';

                    const canCopy = row.valueA !== null;

                    return (
                      <tr
                        key={row.key}
                        style={rowStyle}
                        onMouseEnter={() => setHoveredRowKey(row.key)}
                        onMouseLeave={() => setHoveredRowKey(null)}
                      >
                        {/* Key */}
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#bbb', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.key}
                        </td>

                        {/* Value A */}
                        <td style={{
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.82rem',
                          fontFamily: row.valueA !== null ? 'monospace' : 'inherit',
                          color: valueColorA,
                          fontStyle: row.valueA === null ? 'italic' : 'normal',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          paddingRight: '0.5rem',
                        }}>
                          {formatValue(row.valueA, row.isSecretA)}
                        </td>

                        {/* Copy button column */}
                        <td style={{ padding: '0', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            onClick={() => canCopy && handleCopyAtoB(row.key, row.valueA!)}
                            title={canCopy ? `Copy "${row.key}" value from ${envA.name} to ${envB.name}` : 'No value to copy'}
                            style={{
                              background: 'none',
                              border: isHovered && canCopy ? '1px solid #0d7377' : '1px solid transparent',
                              color: isHovered && canCopy ? '#0d9e9e' : '#333',
                              borderRadius: 4,
                              padding: '0.15rem 0.4rem',
                              cursor: canCopy ? 'pointer' : 'default',
                              fontSize: '0.9rem',
                              transition: 'all 0.1s',
                              opacity: isHovered ? 1 : 0,
                            }}
                          >
                            →
                          </button>
                        </td>

                        {/* Value B */}
                        <td style={{
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.82rem',
                          fontFamily: row.valueB !== null ? 'monospace' : 'inherit',
                          color: valueColorB,
                          fontStyle: row.valueB === null ? 'italic' : 'normal',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          paddingLeft: '0.5rem',
                          borderLeft: isPending ? '2px solid #0d7377' : '2px solid transparent',
                        }}>
                          {formatValue(row.valueB, row.isSecretB)}
                          {isPending && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#0d7377' }}>●</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.82rem', color: '#555' }}>
                {displayRows.length} variable{displayRows.length !== 1 ? 's' : ''}
                {hasPendingChanges && <span style={{ color: '#0d9e9e', marginLeft: '0.75rem' }}>● {Object.keys(pendingEditsB).length} pending change{Object.keys(pendingEditsB).length !== 1 ? 's' : ''}</span>}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {hasPendingChanges && (
                  <>
                    <button
                      onClick={() => setPendingEditsB({})}
                      className="button-secondary button"
                      style={{ fontSize: '0.82rem' }}
                    >
                      Discard
                    </button>
                    {onSaveEnvironment && (
                      <button
                        onClick={handleSaveToB}
                        className="button"
                        disabled={isSaving}
                        style={{ fontSize: '0.82rem' }}
                      >
                        {isSaving ? 'Saving…' : `Save to ${envB.name}`}
                      </button>
                    )}
                  </>
                )}
                <button onClick={onClose} className="button-secondary button">Close</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#555', fontSize: '0.95rem' }}>
            Select two environments to compare
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#166534', border: '1px solid #22c55e', color: '#fff',
          padding: '0.35rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          zIndex: 1100,
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
};
