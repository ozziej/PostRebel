import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { RunnerNodeResult } from '../types';

// Small delete button shown on hover — used by every deletable node
const DeleteButton: React.FC<{ onDelete: () => void }> = ({ onDelete }) => (
  <button
    onPointerDown={e => e.stopPropagation()}
    onMouseDown={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); onDelete(); }}
    title="Delete node"
    style={{
      position: 'absolute', top: -8, right: -8,
      width: 18, height: 18, borderRadius: '50%',
      background: '#ef4444', border: '1.5px solid #111',
      color: '#fff', fontSize: '0.6rem', fontWeight: 700,
      cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 0, lineHeight: 1,
      zIndex: 10,
    }}
  >
    ✕
  </button>
);

interface NodeStatusBadgeProps {
  status: RunnerNodeResult['status'];
}

const NodeStatusBadge: React.FC<NodeStatusBadgeProps> = ({ status }) => {
  if (status === 'idle') return null;

  const styles: Record<string, React.CSSProperties> = {
    running: { background: '#f59e0b', color: '#000', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 600 },
    success: { background: '#22c55e', color: '#000', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 600 },
    error:   { background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 600 },
  };

  const labels: Record<string, string> = {
    running: '…',
    success: '✓',
    error:   '✗',
  };

  return <span style={styles[status]}>{labels[status]}</span>;
};

// ── StartNode ────────────────────────────────────────────────────────────────

interface StartNodeProps {
  data: {
    label: string;
    result?: RunnerNodeResult;
    variables?: { key: string; value: string }[];
  };
}

export const StartNode: React.FC<StartNodeProps> = ({ data }) => {
  const overrideCount = (data.variables ?? []).filter(v => v.key.trim()).length;
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%',
      background: '#166534', border: '2px solid #22c55e',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: '0.7rem', fontWeight: 700,
      userSelect: 'none', position: 'relative',
      cursor: 'pointer',
    }}>
      {data.result && <NodeStatusBadge status={data.result.status} />}
      <span>START</span>
      {overrideCount > 0 ? (
        <span title={`${overrideCount} variable override${overrideCount > 1 ? 's' : ''}`} style={{
          position: 'absolute', top: -4, right: -4,
          background: '#7c3aed', color: '#fff',
          borderRadius: '50%', width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.6rem', fontWeight: 700, border: '1.5px solid #111',
        }}>
          {overrideCount}
        </span>
      ) : (
        <span style={{ fontSize: '0.55rem', color: '#86efac', marginTop: 1 }}>⚙ vars</span>
      )}
      <Handle type="source" position={Position.Bottom} id="out" style={{ background: '#22c55e' }} />
    </div>
  );
};

// ── RequestNode ──────────────────────────────────────────────────────────────

interface RequestNodeProps {
  data: {
    label: string;
    method?: string;
    requestId?: string;
    result?: RunnerNodeResult;
    isSelected?: boolean;
    onDelete?: () => void;
  };
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
  PATCH: '#a855f7', DELETE: '#ef4444', HEAD: '#6b7280', OPTIONS: '#6b7280',
};

export const RequestNode: React.FC<RequestNodeProps> = ({ data }) => {
  const [hovered, setHovered] = useState(false);
  const method = data.method || 'GET';
  const result = data.result;
  const hasResponse = (result?.status === 'success' || result?.status === 'error') && result?.response;

  let border = '1px solid #404040';
  if (data.isSelected)            border = '2px solid #fff';
  else if (result?.status === 'running') border = '2px solid #f59e0b';
  else if (result?.status === 'success') border = '2px solid #22c55e';
  else if (result?.status === 'error')   border = '2px solid #ef4444';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 180, maxWidth: 220,
        background: data.isSelected ? '#243535' : '#1e2d2d',
        border,
        borderRadius: 8,
        padding: '8px 10px',
        color: '#fff',
        fontSize: '0.8rem',
        userSelect: 'none',
        position: 'relative',
        cursor: hasResponse ? 'pointer' : 'default',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} id="in" style={{ background: '#888' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasResponse ? 4 : 0 }}>
        <span style={{
          background: METHOD_COLORS[method] || '#6b7280',
          color: '#000', fontSize: '0.6rem', fontWeight: 700,
          padding: '1px 5px', borderRadius: 4, flexShrink: 0,
        }}>
          {method}
        </span>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, fontSize: '0.78rem', color: '#e0e0e0',
        }}>
          {data.label}
        </span>
        {result && <NodeStatusBadge status={result.status} />}
      </div>

      {/* Compact response summary + click hint */}
      {hasResponse && result?.response && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: '0.65rem', color: '#888', marginTop: 2,
        }}>
          <span style={{
            fontWeight: 700,
            color: result.response.status >= 400 ? '#f87171'
                 : result.response.status >= 300 ? '#facc15'
                 : '#4ade80',
          }}>
            {result.response.status}
          </span>
          <span>{result.response.statusText}</span>
          <span style={{ marginLeft: 'auto', color: '#555' }}>
            {data.isSelected ? '◀ open' : 'click to view'}
          </span>
        </div>
      )}

      {/* Network / pre-response error with no response object */}
      {result?.status === 'error' && !result.response && result.error && (
        <div style={{ color: '#f87171', fontSize: '0.65rem', marginTop: 2, wordBreak: 'break-word' }}>
          {result.error}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="out" style={{ background: '#888' }} />
    </div>
  );
};

// ── DelayNode ────────────────────────────────────────────────────────────────

interface DelayNodeProps {
  data: { label: string; delayMs?: number; result?: RunnerNodeResult; onDelete?: () => void };
}

export const DelayNode: React.FC<DelayNodeProps> = ({ data }) => {
  const [hovered, setHovered] = useState(false);
  const ms = data.delayMs ?? 1000;
  let border = '2px solid #d97706';
  if (data.result?.status === 'running') border = '2px solid #f59e0b';
  else if (data.result?.status === 'success') border = '2px solid #22c55e';
  else if (data.result?.status === 'error') border = '2px solid #ef4444';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 100, background: '#292524', border,
        borderRadius: 8, padding: '8px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        color: '#fff', fontSize: '0.75rem', fontWeight: 700,
        userSelect: 'none', position: 'relative', cursor: 'pointer',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} id="in" style={{ background: '#d97706' }} />
      <span style={{ fontSize: '1rem' }}>⏱</span>
      <span style={{ color: '#fbbf24' }}>{ms}ms</span>
      {data.result && <NodeStatusBadge status={data.result.status} />}
      <Handle type="source" position={Position.Bottom} id="out" style={{ background: '#d97706' }} />
    </div>
  );
};

// ── DebugNode ─────────────────────────────────────────────────────────────────

interface DebugNodeProps {
  data: { label: string; debugScript?: string; result?: RunnerNodeResult; onDelete?: () => void };
}

export const DebugNode: React.FC<DebugNodeProps> = ({ data }) => {
  const [hovered, setHovered] = useState(false);
  const hasScript = !!(data.debugScript?.trim());

  let border = '2px solid #475569';
  if (data.result?.status === 'running') border = '2px solid #f59e0b';
  else if (data.result?.status === 'success') border = '2px solid #22c55e';
  else if (data.result?.status === 'error')   border = '2px solid #ef4444';

  const preview = data.debugScript?.trim().split('\n')[0].slice(0, 36) ?? '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 160, background: '#1e2433', border,
        borderRadius: 8, padding: '8px 10px',
        color: '#fff', fontSize: '0.78rem',
        userSelect: 'none', position: 'relative', cursor: 'pointer',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} id="in" style={{ background: '#64748b' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasScript ? 3 : 0 }}>
        <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{'{}'}</span>
        <span style={{ fontWeight: 700, color: '#93c5fd' }}>Debug</span>
        {data.result && <NodeStatusBadge status={data.result.status} />}
      </div>

      {hasScript ? (
        <div style={{ fontSize: '0.65rem', color: '#64748b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}{data.debugScript!.trim().length > 36 ? '…' : ''}
        </div>
      ) : (
        <div style={{ fontSize: '0.62rem', color: '#475569', fontStyle: 'italic' }}>click to add script</div>
      )}

      <Handle type="source" position={Position.Bottom} id="out" style={{ background: '#64748b' }} />
    </div>
  );
};

// ── ForEachNode ───────────────────────────────────────────────────────────────

interface ForEachNodeProps {
  data: {
    label: string;
    foreachExpression?: string;
    foreachItemVar?: string;
    result?: RunnerNodeResult;
    onDelete?: () => void;
  };
}

export const ForEachNode: React.FC<ForEachNodeProps> = ({ data }) => {
  const [hovered, setHovered] = useState(false);
  const expr = data.foreachExpression || '(not set)';
  const itemVar = data.foreachItemVar || 'item';
  let border = '2px solid #6366f1';
  if (data.result?.status === 'running') border = '2px solid #f59e0b';
  else if (data.result?.status === 'success') border = '2px solid #22c55e';
  else if (data.result?.status === 'error') border = '2px solid #ef4444';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 180, background: '#1e1b4b', border,
        borderRadius: 8, padding: '8px 10px',
        color: '#fff', fontSize: '0.78rem',
        userSelect: 'none', position: 'relative', cursor: 'pointer',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} id="in" style={{ background: '#6366f1' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: '0.85rem' }}>↻</span>
        <span style={{ fontWeight: 700, color: '#a5b4fc' }}>For Each</span>
        {data.result && <NodeStatusBadge status={data.result.status} />}
      </div>
      <div style={{ fontSize: '0.68rem', color: '#818cf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {expr}
      </div>
      <div style={{ fontSize: '0.65rem', color: '#555', marginTop: 2 }}>
        item var: <code style={{ color: '#a5b4fc' }}>{itemVar}</code>
      </div>

      {/* Two source handles: body (left) and done (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.6rem', color: '#555' }}>
        <span style={{ color: '#818cf8' }}>↓ body</span>
        <span style={{ color: '#22c55e' }}>done →</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="body"
        style={{ left: '28%', background: '#6366f1' }} />
      <Handle type="source" position={Position.Bottom} id="done"
        style={{ left: '72%', background: '#22c55e' }} />
    </div>
  );
};

// ── RetryNode ────────────────────────────────────────────────────────────────

interface RetryNodeProps {
  data: {
    label: string;
    id?: string;
    requestLabel?: string;
    retryMaxAttempts?: number;
    retryInitialDelayMs?: number;
    retryBackoffMultiplier?: number;
    result?: RunnerNodeResult;
    __results?: Record<string, RunnerNodeResult>;
    __nodeId?: string;
    onDelete?: () => void;
    isSelected?: boolean;
  };
  selected?: boolean;
}

export const RetryNode: React.FC<RetryNodeProps> = ({ data, selected }) => {
  const [hovered, setHovered] = useState(false);
  const results = (data.__results || {}) as Record<string, RunnerNodeResult>;
  const result = results[data.id as string] || results[(data as any).__nodeId as string] || data.result;
  const status = result?.status ?? 'idle';

  const borderColor = selected || data.isSelected ? '#fff'
    : status === 'running' ? '#f59e0b'
    : status === 'success' ? '#22c55e'
    : status === 'error'   ? '#ef4444'
    : '#b45309';

  const reqName = data.requestLabel as string | undefined;
  const maxAttempts = (data.retryMaxAttempts as number | undefined) ?? 3;
  const initialDelay = (data.retryInitialDelayMs as number | undefined) ?? 1000;
  const multiplier = (data.retryBackoffMultiplier as number | undefined) ?? 2;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#1c1a14',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
        minWidth: 170,
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} style={{ background: '#b45309' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: '#fbbf24', fontSize: '1rem' }}>↺</span>
        <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.5px' }}>RETRY</span>
        {result && <NodeStatusBadge status={status} />}
      </div>
      {reqName ? (
        <div style={{ color: '#e0e0e0', fontSize: '0.8rem', marginBottom: 2 }}>{reqName}</div>
      ) : (
        <div style={{ color: '#555', fontSize: '0.75rem', fontStyle: 'italic' }}>click to configure</div>
      )}
      <div style={{ color: '#666', fontSize: '0.7rem', marginTop: 2 }}>
        max {maxAttempts} · {initialDelay}ms · ×{multiplier}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#b45309' }} />
    </div>
  );
};

// ── SetVariableNode ──────────────────────────────────────────────────────────

interface SetVariableNodeProps {
  data: {
    label: string;
    id?: string;
    assignments?: Array<{ variable: string; expression: string }>;
    result?: RunnerNodeResult;
    __results?: Record<string, RunnerNodeResult>;
    __nodeId?: string;
    onDelete?: () => void;
    isSelected?: boolean;
  };
  selected?: boolean;
}

export const SetVariableNode: React.FC<SetVariableNodeProps> = ({ data, selected }) => {
  const [hovered, setHovered] = useState(false);
  const results = (data.__results || {}) as Record<string, RunnerNodeResult>;
  const result = results[data.id as string] || results[(data as any).__nodeId as string] || data.result;
  const status = result?.status ?? 'idle';

  const borderColor = selected || data.isSelected ? '#fff'
    : status === 'running' ? '#f59e0b'
    : status === 'success' ? '#22c55e'
    : status === 'error'   ? '#ef4444'
    : '#4f46e5';

  const assignments = (data.assignments as Array<{ variable: string; expression: string }> | undefined) || [];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0f0d1f',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
        minWidth: 170,
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      <Handle type="target" position={Position.Top} style={{ background: '#6366f1' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: '#818cf8', fontSize: '0.9rem' }}>x=</span>
        <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.5px' }}>SET VAR</span>
        {result && <NodeStatusBadge status={status} />}
      </div>
      {assignments.length === 0 ? (
        <div style={{ color: '#555', fontSize: '0.75rem', fontStyle: 'italic' }}>click to configure</div>
      ) : (
        assignments.slice(0, 3).map((a, i) => (
          <div key={i} style={{ color: '#aaa', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
            {a.variable} = <span style={{ color: '#6366f1' }}>{a.expression}</span>
          </div>
        ))
      )}
      {assignments.length > 3 && (
        <div style={{ color: '#555', fontSize: '0.7rem' }}>+{assignments.length - 3} more</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#6366f1' }} />
    </div>
  );
};

// ── EndNode ──────────────────────────────────────────────────────────────────

interface EndNodeProps {
  data: { label: string; result?: RunnerNodeResult; onDelete?: () => void };
}

export const EndNode: React.FC<EndNodeProps> = ({ data }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#7f1d1d', border: '2px solid #ef4444',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '0.7rem', fontWeight: 700, userSelect: 'none', position: 'relative',
      }}
    >
      {hovered && data.onDelete && <DeleteButton onDelete={data.onDelete} />}
      {data.result && <NodeStatusBadge status={data.result.status} />}
      <span>END</span>
      <Handle type="target" position={Position.Top} id="in" style={{ background: '#ef4444' }} />
    </div>
  );
};
