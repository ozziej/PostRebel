import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { RunnerNodeResult } from '../types';

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
  data: { label: string; result?: RunnerNodeResult };
}

export const StartNode: React.FC<StartNodeProps> = ({ data }) => (
  <div style={{
    width: 64, height: 64, borderRadius: '50%',
    background: '#166534', border: '2px solid #22c55e',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.7rem', fontWeight: 700, userSelect: 'none', position: 'relative',
  }}>
    {data.result && <NodeStatusBadge status={data.result.status} />}
    <span>START</span>
    <Handle type="source" position={Position.Bottom} id="out" style={{ background: '#22c55e' }} />
  </div>
);

// ── RequestNode ──────────────────────────────────────────────────────────────

interface RequestNodeProps {
  data: {
    label: string;
    method?: string;
    requestId?: string;
    result?: RunnerNodeResult;
    isSelected?: boolean;
  };
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
  PATCH: '#a855f7', DELETE: '#ef4444', HEAD: '#6b7280', OPTIONS: '#6b7280',
};

export const RequestNode: React.FC<RequestNodeProps> = ({ data }) => {
  const method = data.method || 'GET';
  const result = data.result;
  const hasResponse = (result?.status === 'success' || result?.status === 'error') && result?.response;

  let border = '1px solid #404040';
  if (data.isSelected)            border = '2px solid #fff';
  else if (result?.status === 'running') border = '2px solid #f59e0b';
  else if (result?.status === 'success') border = '2px solid #22c55e';
  else if (result?.status === 'error')   border = '2px solid #ef4444';

  return (
    <div style={{
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
    }}>
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

// ── EndNode ──────────────────────────────────────────────────────────────────

interface EndNodeProps {
  data: { label: string; result?: RunnerNodeResult };
}

export const EndNode: React.FC<EndNodeProps> = ({ data }) => (
  <div style={{
    width: 64, height: 64, borderRadius: '50%',
    background: '#7f1d1d', border: '2px solid #ef4444',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.7rem', fontWeight: 700, userSelect: 'none', position: 'relative',
  }}>
    {data.result && <NodeStatusBadge status={data.result.status} />}
    <span>END</span>
    <Handle type="target" position={Position.Top} id="in" style={{ background: '#ef4444' }} />
  </div>
);
