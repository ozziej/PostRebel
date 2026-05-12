import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  addEdge,
  reconnectEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Runner, RunnerNode, RunnerEdge, RunnerNodeResult, RunnerLogEntry,
  Collection, Environment, Certificate, ApiRequest, ApiResponse, DataMapping,
} from '../types';
import { StartNode, RequestNode, EndNode, DelayNode, ForEachNode, DebugNode } from './RunnerNodes';
import { executeRunner } from '../utils/runnerExecutor';

// Node types must be defined outside the component to avoid re-creation on render
const nodeTypes: NodeTypes = {
  start: StartNode as any,
  request: RequestNode as any,
  end: EndNode as any,
  delay: DelayNode as any,
  foreach: ForEachNode as any,
  debug: DebugNode as any,
};

interface RunnerCanvasProps {
  runner: Runner;
  collection: Collection;
  activeEnvironment: Environment | null;
  certificates: Certificate[];
  onSave: (runner: Runner) => void;
  onShowResponse: (response: ApiResponse, request: ApiRequest) => void;
}

interface MappingDialogState {
  edgeId: string;
  condition: string;
  mappings: DataMapping[];
  output: string;
  activeTab: 'condition' | 'mappings' | 'output';
}

// ── Inline response panel ─────────────────────────────────────────────────────

function formatBody(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#4ade80';
  if (status >= 300 && status < 400) return '#facc15';
  if (status >= 400) return '#f87171';
  return '#888';
}

interface ResponsePanelProps {
  nodeLabel: string;
  method?: string;
  result: RunnerNodeResult;
  onClose: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
  PATCH: '#a855f7', DELETE: '#ef4444', HEAD: '#6b7280', OPTIONS: '#6b7280',
};

const InlineResponsePanel: React.FC<ResponsePanelProps> = ({ nodeLabel, method, result, onClose }) => {
  const [resTab, setResTab] = useState<'body' | 'headers'>('body');
  const [reqTab, setReqTab] = useState<'headers' | 'body'>('body');
  const response = result.response;
  const request = result.request;

  const sectionLabel = (text: string) => (
    <div style={{
      padding: '0.2rem 0.75rem',
      background: '#111',
      borderBottom: '1px solid #1e1e1e',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
        {text}
      </span>
    </div>
  );

  const tabBar = (
    tabs: string[],
    active: string,
    onChange: (t: any) => void,
    counts?: Record<string, number>,
  ) => (
    <div style={{ display: 'flex', borderBottom: '1px solid #1e1e1e', background: '#0d0d0d', flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          background: 'none', border: 'none',
          borderBottom: active === t ? '2px solid #0d7377' : '2px solid transparent',
          color: active === t ? '#0d9e9e' : '#666',
          padding: '0.28rem 0.65rem',
          cursor: 'pointer', fontSize: '0.75rem', fontWeight: active === t ? 600 : 400,
          textTransform: 'capitalize',
        }}>
          {t}
          {counts?.[t] !== undefined && (
            <span style={{ marginLeft: 3, fontSize: '0.65rem', color: '#444' }}>({counts[t]})</span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{
      width: 380, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid #2a2a2a',
      background: '#0f0f0f', overflow: 'hidden',
    }}>
      {/* ── Panel header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #2a2a2a',
        background: '#1a1a1a', flexShrink: 0,
      }}>
        {method && (
          <span style={{
            background: METHOD_COLORS[method] || '#6b7280',
            color: '#000', fontSize: '0.6rem', fontWeight: 700,
            padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          }}>
            {method}
          </span>
        )}
        <span style={{ flex: 1, fontSize: '0.82rem', color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nodeLabel}
        </span>
        {response && (
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: statusColor(response.status), flexShrink: 0 }}>
            {response.status} {response.statusText}
          </span>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      {/* ── Request section ── */}
      {request && (
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderBottom: '1px solid #2a2a2a' }}>
          {sectionLabel('Request')}

          {/* URL row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.75rem', background: '#0a0a0a', flexShrink: 0 }}>
            <span style={{
              background: METHOD_COLORS[request.method] || '#6b7280',
              color: '#000', fontSize: '0.58rem', fontWeight: 700,
              padding: '1px 4px', borderRadius: 3, flexShrink: 0,
            }}>
              {request.method}
            </span>
            <span style={{
              fontFamily: 'monospace', fontSize: '0.72rem', color: '#9ca3af',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {request.url}
            </span>
          </div>

          {tabBar(
            ['headers', 'body'], reqTab, setReqTab,
            { headers: Object.keys(request.headers || {}).length },
          )}

          {/* Request tab content — capped height so it doesn't crowd the response */}
          <div style={{ maxHeight: 130, overflowY: 'auto' }}>
            {reqTab === 'headers' && (
              Object.keys(request.headers || {}).length === 0
                ? <div style={{ padding: '0.5rem 0.75rem', color: '#444', fontSize: '0.75rem', fontStyle: 'italic' }}>No headers</div>
                : Object.entries(request.headers || {}).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', padding: '0.25rem 0.75rem', borderBottom: '1px solid #111', gap: 8, fontSize: '0.74rem' }}>
                    <span style={{ color: '#0d9e9e', flexShrink: 0, minWidth: 110, wordBreak: 'break-all' }}>{k}</span>
                    <span style={{ color: '#9ca3af', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))
            )}
            {reqTab === 'body' && (
              !request.body || request.body.type === 'none'
                ? <div style={{ padding: '0.5rem 0.75rem', color: '#444', fontSize: '0.75rem', fontStyle: 'italic' }}>No body</div>
                : <pre style={{ margin: 0, padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#9ca3af', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {request.body.type === 'raw' ? String(request.body.data || '') : `[${request.body.type}]`}
                  </pre>
            )}
          </div>
        </div>
      )}

      {/* ── Response section ── */}
      {request && (response || result.error) && sectionLabel('Response')}

      {/* Network error — no HTTP response */}
      {!response && result.error && (
        <div style={{ padding: '1rem', color: '#f87171', fontSize: '0.85rem', flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Network Error</div>
          <div style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>{result.error}</div>
        </div>
      )}

      {response && (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 16, padding: '0.3rem 0.75rem', borderBottom: '1px solid #222', fontSize: '0.72rem', color: '#666', flexShrink: 0 }}>
            <span>{response.time} ms</span>
            <span>{(response.size / 1024).toFixed(1)} KB</span>
          </div>

          {tabBar(
            ['headers', 'body'], resTab, setResTab,
            { headers: Object.keys(response.headers).length },
          )}

          {resTab === 'body' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem' }}>
              {response.data === null || response.data === undefined || response.data === '' ? (
                <div style={{ color: '#555', fontSize: '0.82rem', fontStyle: 'italic' }}>Empty response body</div>
              ) : (
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.78rem', color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>
                  {formatBody(response.data)}
                </pre>
              )}
            </div>
          )}

          {resTab === 'headers' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {Object.entries(response.headers).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', padding: '0.3rem 0.75rem', borderBottom: '1px solid #1a1a1a', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: '#0d9e9e', flexShrink: 0, minWidth: 140, wordBreak: 'break-all' }}>{key}</span>
                  <span style={{ color: '#d4d4d4', wordBreak: 'break-all' }}>{value}</span>
                </div>
              ))}
              {Object.keys(response.headers).length === 0 && (
                <div style={{ padding: '1rem', color: '#555', fontSize: '0.82rem', fontStyle: 'italic' }}>No headers</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Main canvas ───────────────────────────────────────────────────────────────

export const RunnerCanvas: React.FC<RunnerCanvasProps> = ({
  runner,
  collection,
  activeEnvironment,
  certificates,
  onSave,
  onShowResponse,
}) => {
  const [nodeResults, setNodeResults] = useState<Record<string, RunnerNodeResult>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [followedEdgeIds, setFollowedEdgeIds] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [mappingDialog, setMappingDialog] = useState<MappingDialogState | null>(null);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [requestSearch, setRequestSearch] = useState('');
  const [startVarsOpen, setStartVarsOpen] = useState(false);
  const [startVarDrafts, setStartVarDrafts] = useState<{ key: string; value: string }[]>([]);
  const [suggestIdx, setSuggestIdx] = useState<number | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [runnerLogs, setRunnerLogs] = useState<RunnerLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [delayConfigNodeId, setDelayConfigNodeId] = useState<string | null>(null);
  const [delayMsDraft, setDelayMsDraft] = useState('1000');
  const [foreachConfigNodeId, setForeachConfigNodeId] = useState<string | null>(null);
  const [foreachExprDraft, setForeachExprDraft] = useState('');
  const [foreachItemVarDraft, setForeachItemVarDraft] = useState('item');
  const [debugConfigNodeId, setDebugConfigNodeId] = useState<string | null>(null);
  const [debugScriptDraft, setDebugScriptDraft] = useState('');
  const [showNodesMenu, setShowNodesMenu] = useState(false);
  const nodesMenuAnchorRef = useRef<{ top: number; left: number } | null>(null);

  const showToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSaveToast(true);
    toastTimerRef.current = setTimeout(() => setSaveToast(false), 2000);
  }, []);

  const allRequests: ApiRequest[] = [
    ...collection.requests,
    ...(collection.folders?.flatMap(f => f.requests) || []),
  ];

  const findRequest = useCallback((requestId: string) =>
    allRequests.find(r => r.id === requestId),
  [allRequests]);

  // All variable names available in the active environment (for autocomplete in start-vars dialog)
  const availableVarNames = useMemo(() => {
    if (!activeEnvironment) return [];
    const fromRecord = Object.keys(activeEnvironment.variables ?? {});
    const fromArray = (activeEnvironment.variablesArray ?? []).map(v => v.key);
    return [...new Set([...fromRecord, ...fromArray])].filter(k => k.trim()).sort();
  }, [activeEnvironment]);

  // Convert runner nodes → React Flow nodes
  const toFlowNodes = useCallback((
    nodes: RunnerNode[],
    results: Record<string, RunnerNodeResult>,
    selectedId: string | null,
  ): Node[] =>
    nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        label: n.data.label,
        requestId: n.data.requestId,
        method: n.data.requestId ? findRequest(n.data.requestId)?.method : undefined,
        result: results[n.id],
        isSelected: n.id === selectedId,
        variables: n.data.variables,
        delayMs: n.data.delayMs,
        foreachExpression: n.data.foreachExpression,
        foreachItemVar: n.data.foreachItemVar,
        debugScript: n.data.debugScript,
      },
    })),
  [findRequest]);

  const toFlowEdges = useCallback((
    edges: RunnerEdge[],
    followedIds: Set<string> = new Set(),
    hasRun: boolean = false,
  ): Edge[] =>
    edges.map(e => {
      const isConditional = !!(e.data?.condition?.trim());
      const isFollowed = followedIds.has(e.id);
      const isSkipped = hasRun && isConditional && !isFollowed;

      let stroke = '#0d7377'; // default: teal
      if (hasRun) {
        stroke = isFollowed ? '#22c55e' : '#666'; // green if followed, muted if not
      } else if (isConditional) {
        stroke = '#f59e0b'; // amber for conditional edges pre-run
      }

      const condLabel = isConditional
        ? e.data!.condition!.trim()
            .replace(/^return\s+/, '')  // strip leading "return "
            .replace(/;$/, '')          // strip trailing semicolon
            .slice(0, 36) + (e.data!.condition!.trim().length > 40 ? '…' : '')
        : null;

      const mappingsLabel = e.data?.mappings?.length
        ? `${e.data.mappings.length} ↦`
        : null;

      const edgeOutput = e.data?.output?.trim();
      const outputLabel = edgeOutput
        ? `▶ ${edgeOutput.slice(0, 24)}${edgeOutput.length > 24 ? '…' : ''}`
        : null;

      const label = condLabel
        ? (mappingsLabel ? `if (${condLabel})  ${mappingsLabel}` : `if (${condLabel})`)
        : outputLabel ?? mappingsLabel ?? undefined;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        style: {
          stroke,
          strokeWidth: isFollowed ? 2.5 : 2,
          strokeDasharray: isConditional && !isFollowed ? '6 4' : undefined,
          opacity: isSkipped ? 0.6 : 1,
        },
        reconnectable: true,
        label,
        labelStyle: { fill: isConditional ? '#f59e0b' : '#aaa', fontSize: 10 },
        labelBgStyle: { fill: '#111' },
        data: e.data,
      };
    }),
  []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(runner.nodes, {}, null),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(runner.edges),
  );
  const runnerRef = useRef(runner);
  const rfInstanceRef = useRef<any>(null);

  // Returns the centre of the currently visible canvas in flow coordinates
  const getCanvasCenter = useCallback((): { x: number; y: number } => {
    const inst = rfInstanceRef.current;
    if (!inst) return { x: 250, y: 200 };
    const { x: vpX, y: vpY, zoom } = inst.getViewport();
    const container = document.querySelector<HTMLElement>('.react-flow');
    const w = container?.clientWidth ?? 800;
    const h = container?.clientHeight ?? 500;
    return { x: (-vpX + w / 2) / zoom, y: (-vpY + h / 2) / zoom };
  }, []);

  // Sync when the runner changes (different runner selected)
  useEffect(() => {
    runnerRef.current = runner;
    setNodes(toFlowNodes(runner.nodes, {}, null));
    setEdges(toFlowEdges(runner.edges, new Set(), false));
    setNodeResults({});
    setSelectedNodeId(null);
    setFollowedEdgeIds(new Set());
    setRunnerLogs([]);
  }, [runner.id]);

  // Re-style edges whenever followedEdgeIds changes (after a run)
  useEffect(() => {
    if (followedEdgeIds.size === 0) return;
    const currentRunner = runnerRef.current;
    setEdges(toFlowEdges(currentRunner.edges, followedEdgeIds, true));
  }, [followedEdgeIds]);

  // Close Add Request and Nodes dropdowns when clicking outside
  useEffect(() => {
    if (!showAddRequest) return;
    const close = () => { setShowAddRequest(false); setRequestSearch(''); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showAddRequest]);

  useEffect(() => {
    if (!showNodesMenu) return;
    const close = () => setShowNodesMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showNodesMenu]);

  // Auto-scroll log panel to newest entry
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runnerLogs]);

  const handleDeleteNode = useCallback((nodeId: string, label: string) => {
    if (!confirm(`Delete "${label}"? Any connected edges will also be removed.`)) return;
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Refresh node data whenever results or selection changes
  useEffect(() => {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: {
        ...n.data,
        result: nodeResults[n.id],
        isSelected: n.id === selectedNodeId,
        onDelete: n.type === 'start' ? undefined
          : () => handleDeleteNode(n.id, (n.data.label as string) || 'node'),
      },
    })));
  }, [nodeResults, selectedNodeId, handleDeleteNode]);

  // ── Node click: open inline panel ──────────────────────────────────────────

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'start') {
      const existing = (node.data.variables as { key: string; value: string }[] | undefined) ?? [];
      setStartVarDrafts(existing.length > 0 ? [...existing] : [{ key: '', value: '' }]);
      setStartVarsOpen(true);
      return;
    }
    if (node.type === 'delay') {
      setDelayMsDraft(String((node.data.delayMs as number | undefined) ?? 1000));
      setDelayConfigNodeId(node.id);
      return;
    }
    if (node.type === 'foreach') {
      setForeachExprDraft((node.data.foreachExpression as string | undefined) ?? '');
      setForeachItemVarDraft((node.data.foreachItemVar as string | undefined) ?? 'item');
      setForeachConfigNodeId(node.id);
      return;
    }
    if (node.type === 'debug') {
      setDebugScriptDraft((node.data.debugScript as string | undefined) ?? '');
      setDebugConfigNodeId(node.id);
      return;
    }
    // Request node → inline response panel
    const result = nodeResults[node.id];
    const hasViewable = result && (result.status === 'success' || result.status === 'error');
    if (!hasViewable) return;
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
  }, [nodeResults]);

  const handleSaveStartVars = useCallback(() => {
    const vars = startVarDrafts.filter(v => v.key.trim());
    // Update the start node in React Flow
    setNodes(prev => prev.map(n =>
      n.type !== 'start' ? n : { ...n, data: { ...n.data, variables: vars } },
    ));
    // Update runnerRef so the next Run picks them up immediately
    runnerRef.current = {
      ...runnerRef.current,
      nodes: runnerRef.current.nodes.map(n =>
        n.type !== 'start' ? n : { ...n, data: { ...n.data, variables: vars } },
      ),
    };
    setStartVarsOpen(false);
  }, [startVarDrafts, setNodes]);

  const handleSaveDelayConfig = useCallback(() => {
    const ms = Math.max(0, parseInt(delayMsDraft, 10) || 0);
    setNodes(prev => prev.map(n =>
      n.id !== delayConfigNodeId ? n : { ...n, data: { ...n.data, delayMs: ms, label: `${ms}ms` } },
    ));
    setDelayConfigNodeId(null);
  }, [delayConfigNodeId, delayMsDraft, setNodes]);

  const handleSaveForeachConfig = useCallback(() => {
    const expr = foreachExprDraft.trim();
    const itemVar = foreachItemVarDraft.trim() || 'item';
    setNodes(prev => prev.map(n =>
      n.id !== foreachConfigNodeId ? n : {
        ...n,
        data: {
          ...n.data,
          foreachExpression: expr,
          foreachItemVar: itemVar,
          label: `↻ ${expr || 'array'}`,
        },
      },
    ));
    setForeachConfigNodeId(null);
  }, [foreachConfigNodeId, foreachExprDraft, foreachItemVarDraft, setNodes]);

  const handleSaveDebugConfig = useCallback(() => {
    const script = debugScriptDraft; // preserve whitespace/formatting
    setNodes(prev => prev.map(n =>
      n.id !== debugConfigNodeId ? n : {
        ...n,
        data: {
          ...n.data,
          debugScript: script,
          label: script.trim() ? script.trim().split('\n')[0].slice(0, 30) : 'Debug',
        },
      },
    ));
    setDebugConfigNodeId(null);
  }, [debugConfigNodeId, debugScriptDraft, setNodes]);

  const handleAddDebug = useCallback(() => {
    const { x, y } = getCanvasCenter();
    const newNode: Node = {
      id: `debug-${Date.now()}`, type: 'debug',
      position: { x: x - 80, y: y - 30 },
      data: { label: 'Debug', debugScript: '' },
    };
    setNodes(prev => prev.concat(newNode));
  }, [getCanvasCenter, setNodes]);

  // ── Build Runner from current flow state ───────────────────────────────────

  const buildRunnerFromFlow = useCallback((): Runner => {
    const runnerNodes: RunnerNode[] = nodes.map(n => ({
      id: n.id,
      type: n.type as 'start' | 'request' | 'end',
      position: n.position,
      data: {
        label: (n.data.label as string) || '',
        requestId: n.data.requestId as string | undefined,
        ...(n.type === 'start' && (n.data.variables as any)?.length
          ? { variables: n.data.variables as { key: string; value: string }[] }
          : {}),
        ...(n.type === 'delay' && n.data.delayMs != null
          ? { delayMs: n.data.delayMs as number }
          : {}),
        ...(n.type === 'foreach'
          ? {
              foreachExpression: (n.data.foreachExpression as string | undefined) ?? '',
              foreachItemVar: (n.data.foreachItemVar as string | undefined) ?? 'item',
            }
          : {}),
        ...(n.type === 'debug' && (n.data.debugScript as string | undefined)
          ? { debugScript: (n.data.debugScript as string) }
          : {}),
      },
    }));

    const runnerEdges: RunnerEdge[] = edges.map(e => {
      const d = e.data as any;
      const edgeData: RunnerEdge['data'] = {};
      if (d?.mappings?.length) edgeData.mappings = d.mappings;
      if (d?.condition?.trim()) edgeData.condition = d.condition.trim();
      if (d?.output?.trim()) edgeData.output = d.output.trim();
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
        data: Object.keys(edgeData).length ? edgeData : undefined,
      };
    });

    return {
      ...runnerRef.current,
      name: runnerRef.current.name,
      nodes: runnerNodes,
      edges: runnerEdges,
      updatedAt: new Date().toISOString(),
    };
  }, [nodes, edges]);

  const handleSave = useCallback(() => {
    const updated = buildRunnerFromFlow();
    runnerRef.current = updated;
    onSave(updated);
    showToast();
  }, [buildRunnerFromFlow, onSave, showToast]);

  const handleCancel = useCallback(() => {
    if (!confirm('Discard unsaved changes and revert to the last saved version?')) return;
    runnerRef.current = runner;
    setNodes(toFlowNodes(runner.nodes, {}, null));
    setEdges(toFlowEdges(runner.edges, new Set(), false));
    setNodeResults({});
    setSelectedNodeId(null);
    setFollowedEdgeIds(new Set());
    setRunnerLogs([]);
  }, [runner, toFlowNodes, toFlowEdges]);

  const handleConnect = useCallback((params: Connection) => {
    setEdges(prev => addEdge({
      ...params,
      id: `edge-${Date.now()}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0d7377' },
      style: { stroke: '#0d7377', strokeWidth: 2 },
      reconnectable: true,
    }, prev));
  }, [setEdges]);

  const handleReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    setEdges(prev => reconnectEdge(oldEdge, newConnection, prev));
  }, [setEdges]);

  const handleEdgeClick = useCallback((_: any, edge: Edge) => {
    const data = edge.data as any;
    setMappingDialog({
      edgeId: edge.id,
      condition: data?.condition || '',
      mappings: data?.mappings ? [...data.mappings] : [],
      output: data?.output || '',
      activeTab: data?.output?.trim() ? 'output' : data?.condition?.trim() ? 'condition' : 'mappings',
    });
  }, []);

  const handleAddRequest = useCallback((request: ApiRequest) => {
    const { x, y } = getCanvasCenter();
    const newNode: Node = {
      id: `node-${Date.now()}`, type: 'request',
      position: { x: x - 90, y: y - 25 },
      data: { label: request.name, requestId: request.id, method: request.method },
    };
    setNodes(prev => prev.concat(newNode));
    setShowAddRequest(false);
  }, [getCanvasCenter, setNodes]);

  const handleAddDelay = useCallback(() => {
    const { x, y } = getCanvasCenter();
    const newNode: Node = {
      id: `delay-${Date.now()}`, type: 'delay',
      position: { x: x - 50, y: y - 35 },
      data: { label: '1000ms', delayMs: 1000 },
    };
    setNodes(prev => prev.concat(newNode));
  }, [getCanvasCenter, setNodes]);

  const handleAddForeach = useCallback(() => {
    const { x, y } = getCanvasCenter();
    const newNode: Node = {
      id: `foreach-${Date.now()}`, type: 'foreach',
      position: { x: x - 90, y: y - 40 },
      data: { label: '↻ array', foreachExpression: '', foreachItemVar: 'item' },
    };
    setNodes(prev => prev.concat(newNode));
  }, [getCanvasCenter, setNodes]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setNodeResults({});
    setSelectedNodeId(null);
    setFollowedEdgeIds(new Set());
    setRunnerLogs([]);
    setShowLog(true);
    // Reset edges to pre-run styling
    setEdges(toFlowEdges(runnerRef.current.edges, new Set(), false));

    const currentRunner = buildRunnerFromFlow();
    runnerRef.current = currentRunner;

    try {
      await executeRunner(
        currentRunner,
        collection,
        activeEnvironment,
        certificates,
        (nodeId, result) => {
          setNodeResults(prev => ({ ...prev, [nodeId]: result }));
        },
        (edgeId) => {
          setFollowedEdgeIds(prev => new Set([...prev, edgeId]));
        },
        (entry) => {
          setRunnerLogs(prev => [...prev, entry]);
        },
      );
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, buildRunnerFromFlow, collection, activeEnvironment, certificates, toFlowEdges]);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(buildRunnerFromFlow(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runnerRef.current.name}.runner.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildRunnerFromFlow]);

  const handleImport = useCallback(async () => {
    const result = await window.electronAPI.selectJsonFile();
    if (result.success && result.content) {
      try {
        const imported: Runner = JSON.parse(result.content);
        setNodes(toFlowNodes(imported.nodes, {}, null));
        setEdges(toFlowEdges(imported.edges, new Set(), false));
        setNodeResults({});
        setSelectedNodeId(null);
        setFollowedEdgeIds(new Set());
      } catch {
        alert('Invalid runner JSON file');
      }
    }
  }, [toFlowNodes, toFlowEdges]);

  const handleDeleteEdge = useCallback(() => {
    if (!mappingDialog) return;
    const hasData = mappingDialog.condition.trim() ||
      mappingDialog.output.trim() ||
      mappingDialog.mappings.some(m => m.fromExpression.trim() || m.toVariable.trim());
    if (hasData && !confirm('This edge has a condition or mappings configured. Delete it anyway?')) return;

    // Remove from React Flow state only — buildRunnerFromFlow() syncs runnerRef on next Run/Save
    setEdges(prev => prev.filter(e => e.id !== mappingDialog.edgeId));
    setMappingDialog(null);
  }, [mappingDialog, setEdges]);

  const handleSaveEdgeDialog = useCallback(() => {
    if (!mappingDialog) return;
    const mappings = mappingDialog.mappings.filter(
      m => m.fromExpression.trim() && m.toVariable.trim(),
    );
    const condition = mappingDialog.condition.trim();
    const output = mappingDialog.output.trim();
    const newData = {
      ...(mappings.length ? { mappings } : {}),
      ...(condition ? { condition } : {}),
      ...(output ? { output } : {}),
    };
    const hasData = Object.keys(newData).length > 0;

    // Update only the target edge within the existing React Flow state.
    // Do NOT rebuild from runnerRef.current — that ref may not yet contain edges
    // the user drew since the last explicit Save, and rebuilding from it would
    // silently discard them.
    setEdges(prev => prev.map(e => {
      if (e.id !== mappingDialog.edgeId) return e;

      const isConditional = !!condition;
      const isFollowed = followedEdgeIds.has(e.id);
      const hasRun = followedEdgeIds.size > 0;

      let stroke = '#0d7377';
      if (hasRun) stroke = isFollowed ? '#22c55e' : '#666';
      else if (isConditional) stroke = '#f59e0b';

      const condLabel = condition
        ? condition.replace(/^return\s+/, '').replace(/;$/, '').slice(0, 36)
          + (condition.replace(/^return\s+/, '').length > 36 ? '…' : '')
        : null;
      const mappingsLabel = mappings.length ? `${mappings.length} ↦` : null;
      const outputLabel = output ? `▶ ${output.slice(0, 24)}${output.length > 24 ? '…' : ''}` : null;
      const label = condLabel
        ? (mappingsLabel ? `if (${condLabel})  ${mappingsLabel}` : `if (${condLabel})`)
        : outputLabel ?? mappingsLabel ?? undefined;

      return {
        ...e,
        data: hasData ? newData : undefined,
        label,
        labelStyle: { fill: isConditional ? '#f59e0b' : '#aaa', fontSize: 10 },
        labelBgStyle: { fill: '#111' },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        style: {
          stroke,
          strokeWidth: isFollowed ? 2.5 : 2,
          strokeDasharray: isConditional && !isFollowed ? '6 4' : undefined,
          opacity: hasRun && isConditional && !isFollowed ? 0.6 : 1,
        },
      };
    }));
    setMappingDialog(null);
  }, [mappingDialog, setEdges, followedEdgeIds]);

  // Derive the selected node's data for the response panel
  const selectedResult = selectedNodeId ? nodeResults[selectedNodeId] : null;
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid #2a2a2a',
        background: '#1a1a1a', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{
          color: '#e0e0e0', fontSize: '0.9rem', padding: '0.2rem 0.5rem',
          fontWeight: 500, maxWidth: 200, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {runner.name}
        </span>

        <button
          className="button"
          onClick={handleRun}
          disabled={isRunning}
          style={{ background: isRunning ? '#333' : '#166534', borderColor: '#22c55e', color: '#fff' }}
        >
          {isRunning ? 'Running…' : '▶ Run'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className="button button-secondary"
            onClick={e => {
              e.stopPropagation();
              setShowAddRequest(v => {
                if (v) setRequestSearch('');
                return !v;
              });
            }}
          >
            + Add Request
          </button>
          {showAddRequest && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: '#1e1e1e', border: '1px solid #444', borderRadius: 6,
              minWidth: 240, maxHeight: 320,
              zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Search input */}
              <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #333', flexShrink: 0 }}>
                <input
                  autoFocus
                  placeholder="Search requests…"
                  value={requestSearch}
                  onChange={e => setRequestSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowAddRequest(false); setRequestSearch(''); } }}
                  style={{
                    width: '100%', background: '#111', border: '1px solid #333',
                    borderRadius: 4, color: '#e0e0e0', fontSize: '0.8rem',
                    padding: '0.3rem 0.5rem', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Filtered list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {(() => {
                  const filtered = allRequests.filter(r =>
                    r.name.toLowerCase().includes(requestSearch.toLowerCase()) ||
                    r.method.toLowerCase().includes(requestSearch.toLowerCase()),
                  );
                  if (allRequests.length === 0) return (
                    <div style={{ padding: '0.75rem', color: '#666', fontSize: '0.8rem' }}>
                      No requests in collection
                    </div>
                  );
                  if (filtered.length === 0) return (
                    <div style={{ padding: '0.75rem', color: '#666', fontSize: '0.8rem' }}>
                      No matches for "{requestSearch}"
                    </div>
                  );
                  return filtered.map(req => (
                    <div
                      key={req.id}
                      onClick={() => { handleAddRequest(req); setRequestSearch(''); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '0.4rem 0.75rem', cursor: 'pointer',
                        fontSize: '0.82rem', color: '#e0e0e0',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{
                        background: METHOD_COLORS[req.method] || '#0d7377',
                        color: '#000', fontSize: '0.6rem',
                        fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                      }}>
                        {req.method}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.name}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Nodes dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="button button-secondary"
            onClick={e => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              nodesMenuAnchorRef.current = { top: rect.bottom + 4, left: rect.left };
              setShowNodesMenu(v => !v);
            }}
          >
            + Nodes ▾
          </button>
          {showNodesMenu && nodesMenuAnchorRef.current && (
            <div
              style={{
                position: 'fixed',
                top: nodesMenuAnchorRef.current.top,
                left: nodesMenuAnchorRef.current.left,
                background: '#1e1e1e', border: '1px solid #444', borderRadius: 6,
                zIndex: 9999, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}
              onClick={() => setShowNodesMenu(false)}
            >
              {[
                { icon: '{}', label: 'Debug Script', action: handleAddDebug },
                { icon: '⏱', label: 'Delay', action: handleAddDelay },
                { icon: '↻', label: 'For Each', action: handleAddForeach },
              ].map(({ icon, label, action }) => (
                <div
                  key={label}
                  onClick={action}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', color: '#e0e0e0' }}
                >
                  <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="button button-secondary" onClick={handleSave}>Save</button>
        <button className="button button-secondary" onClick={handleCancel} title="Discard unsaved changes and revert to last saved version" style={{ color: '#f87171', borderColor: '#f87171' }}>Revert</button>
        <button className="button button-secondary" onClick={handleExport} title="Export runner as JSON">Export</button>
        <button className="button button-secondary" onClick={handleImport} title="Import runner from JSON">Import</button>

        <button
          className={`button ${showLog ? '' : 'button-secondary'}`}
          onClick={() => setShowLog(v => !v)}
          title="Toggle execution log"
          style={{ position: 'relative' }}
        >
          Log
          {runnerLogs.length > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#0d7377', color: '#fff',
              borderRadius: '50%', width: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.55rem', fontWeight: 700,
            }}>
              {runnerLogs.length > 99 ? '99+' : runnerLogs.length}
            </span>
          )}
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#444' }}>
          Click edge → settings · Click node → configure / view response
        </span>
      </div>

      {/* Canvas + optional response panel + log panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={inst => { rfInstanceRef.current = inst; }}
            onConnect={handleConnect}
            onReconnect={handleReconnect}
            onEdgeClick={handleEdgeClick}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: '#111' }}
          >
            <Background color="#333" gap={20} />
            <Controls style={{ background: '#1a1a1a', border: '1px solid #333' }} />
          </ReactFlow>

          {saveToast && (
            <div style={{
              position: 'absolute',
              bottom: '1.25rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#166534',
              border: '1px solid #22c55e',
              color: '#fff',
              padding: '0.35rem 1rem',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 500,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: 10,
            }}>
              ✓ Saved
            </div>
          )}
        </div>

        {/* Inline response panel — shown when a completed node is selected */}
        {selectedResult && selectedNode && (
          <InlineResponsePanel
            nodeLabel={selectedNode.data.label as string}
            method={selectedNode.data.method as string | undefined}
            result={selectedResult}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>{/* end canvas + response panel row */}

      {/* Execution log panel */}
      {showLog && (
        <div style={{
          height: 200, flexShrink: 0, borderTop: '1px solid #2a2a2a',
          background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0.3rem 0.75rem', borderBottom: '1px solid #1a1a1a',
            background: '#111', flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Execution Log
            </span>
            <span style={{ fontSize: '0.7rem', color: '#333' }}>{runnerLogs.length} entries</span>
            <button
              onClick={() => setRunnerLogs([])}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.72rem' }}
            >
              Clear
            </button>
            <button
              onClick={() => setShowLog(false)}
              style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
            {runnerLogs.length === 0 ? (
              <div style={{ padding: '0.75rem', color: '#333', fontSize: '0.78rem', fontStyle: 'italic' }}>
                Run the flow to see execution logs here.
              </div>
            ) : runnerLogs.map((entry, i) => {
              const colors: Record<RunnerLogEntry['level'], string> = {
                info:    '#888',
                success: '#4ade80',
                warn:    '#f59e0b',
                error:   '#f87171',
                script:  '#0d9e9e',
              };
              return (
                <div key={i} style={{
                  padding: '0.15rem 0.75rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: colors[entry.level],
                  lineHeight: 1.5,
                  borderBottom: '1px solid #111',
                }}>
                  {entry.message}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
      </div>{/* end column wrapper */}

      {/* Start node: variable overrides dialog */}
      {startVarsOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #444', borderRadius: 8,
            width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #333' }}>
              <div>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>Start — Variable Overrides</span>
              </div>
              <button onClick={() => setStartVarsOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                Override environment variables for this runner run only. These values take precedence over the active environment and are not saved back to it.
              </p>

              {/* Column headers */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Variable name</div>
                <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Value</div>
                <div style={{ width: 28 }} />
              </div>

              {startVarDrafts.map((v, idx) => {
                const suggestions = availableVarNames.filter(name =>
                  !v.key || name.toLowerCase().includes(v.key.toLowerCase()),
                );
                const currentEnvValue = activeEnvironment?.variables[v.key]
                  ?? activeEnvironment?.variablesArray?.find(ev => ev.key === v.key)?.value;
                const isSecret = activeEnvironment?.variablesArray?.find(ev => ev.key === v.key)?.isSecret;

                return (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  {/* Variable name input with dropdown autocomplete */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      placeholder="e.g. base_url"
                      value={v.key}
                      onChange={e => {
                        const updated = [...startVarDrafts];
                        updated[idx] = { ...updated[idx], key: e.target.value };
                        setStartVarDrafts(updated);
                      }}
                      onFocus={() => setSuggestIdx(idx)}
                      onBlur={() => setTimeout(() => setSuggestIdx(null), 150)}
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                    {suggestIdx === idx && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        marginTop: 2, background: '#1e1e1e', border: '1px solid #444',
                        borderRadius: 4, zIndex: 10001, maxHeight: 180, overflowY: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      }}>
                        {suggestions.map(name => {
                          const envVal = activeEnvironment?.variables[name]
                            ?? activeEnvironment?.variablesArray?.find(ev => ev.key === name)?.value;
                          const secret = activeEnvironment?.variablesArray?.find(ev => ev.key === name)?.isSecret;
                          return (
                            <div
                              key={name}
                              onMouseDown={() => {
                                const updated = [...startVarDrafts];
                                updated[idx] = { ...updated[idx], key: name };
                                setStartVarDrafts(updated);
                                setSuggestIdx(null);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 8, padding: '0.35rem 0.6rem', cursor: 'pointer',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#e0e0e0' }}>{name}</span>
                              <span style={{ fontSize: '0.72rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                                {secret ? '••••••' : (envVal ?? '')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <input
                    placeholder={
                      isSecret ? '(secret — enter new value)'
                      : currentEnvValue ? `currently: ${currentEnvValue}`
                      : 'override value'
                    }
                    value={v.value}
                    onChange={e => {
                      const updated = [...startVarDrafts];
                      updated[idx] = { ...updated[idx], value: e.target.value };
                      setStartVarDrafts(updated);
                    }}
                    className="form-input"
                    style={{ flex: 1, fontSize: '0.82rem' }}
                  />
                  <button
                    className="button-secondary button"
                    onClick={() => setStartVarDrafts(prev => prev.filter((_, i) => i !== idx))}
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                  >✗</button>
                </div>
              ); })}

              <button
                className="button button-secondary"
                onClick={() => setStartVarDrafts(prev => [...prev, { key: '', value: '' }])}
                style={{ fontSize: '0.82rem' }}
              >
                + Add Override
              </button>

              <div style={{ background: '#111', borderRadius: 4, padding: '0.5rem 0.75rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#666', lineHeight: 1.6 }}>
                Use this to swap <code style={{ color: '#0d9e9e' }}>base_url</code> to a staging server, pin a specific <code style={{ color: '#0d9e9e' }}>user_id</code>, or inject a known token without touching your environment.
                Values here can also be referenced with <code style={{ color: '#0d9e9e' }}>{'{{variable_name}}'}</code> in request nodes.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0.75rem 1rem', borderTop: '1px solid #333' }}>
              <button className="button button-secondary" onClick={() => setStartVarsOpen(false)}>Cancel</button>
              <button className="button" onClick={handleSaveStartVars}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edge dialog: Condition + Mappings */}
      {mappingDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #444', borderRadius: 8,
            width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Dialog header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.75rem 1rem', borderBottom: '1px solid #333',
            }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>Edge Settings</span>
              <button onClick={() => setMappingDialog(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#141414' }}>
              {(['condition', 'mappings', 'output'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMappingDialog(prev => prev ? { ...prev, activeTab: tab } : null)}
                  style={{
                    background: 'none', border: 'none',
                    borderBottom: mappingDialog.activeTab === tab ? '2px solid #f59e0b' : '2px solid transparent',
                    color: mappingDialog.activeTab === tab ? '#f59e0b' : '#888',
                    padding: '0.4rem 1rem',
                    cursor: 'pointer', fontSize: '0.82rem',
                    fontWeight: mappingDialog.activeTab === tab ? 600 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {tab === 'condition' ? 'Condition (if)' : tab === 'mappings' ? 'Data Mappings' : 'Output'}
                  {tab === 'condition' && mappingDialog.condition.trim() && (
                    <span style={{ marginLeft: 5, background: '#f59e0b', color: '#000', fontSize: '0.6rem', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>ON</span>
                  )}
                  {tab === 'mappings' && mappingDialog.mappings.length > 0 && (
                    <span style={{ marginLeft: 5, background: '#0d7377', color: '#fff', fontSize: '0.6rem', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>{mappingDialog.mappings.length}</span>
                  )}
                  {tab === 'output' && mappingDialog.output.trim() && (
                    <span style={{ marginLeft: 5, background: '#22c55e', color: '#000', fontSize: '0.6rem', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>ON</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>

              {/* ── Condition tab ──────────────────────────────────────── */}
              {mappingDialog.activeTab === 'condition' && (
                <div>
                  <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                    Write a JavaScript expression that returns <code style={{ background: '#111', padding: '0 3px', borderRadius: 3, color: '#4ade80' }}>true</code> to follow this edge, or <code style={{ background: '#111', padding: '0 3px', borderRadius: 3, color: '#f87171' }}>false</code> to skip it.
                    Leave blank to always follow (unconditional / else).
                  </p>

                  <textarea
                    className="form-textarea"
                    value={mappingDialog.condition}
                    onChange={e => setMappingDialog(prev => prev ? { ...prev, condition: e.target.value } : null)}
                    placeholder={`// Available: response, body, status, headers, variables\n\nreturn status === 200;\n\n// return body.success === true;\n// return body.access_token !== undefined;\n// return status >= 200 && status < 300;`}
                    style={{ minHeight: 160, fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical' }}
                    spellCheck={false}
                  />

                  <div style={{ background: '#111', borderRadius: 4, padding: '0.6rem 0.75rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#666', lineHeight: 1.7 }}>
                    <div style={{ color: '#555', fontWeight: 600, marginBottom: 3 }}>Available variables</div>
                    <code style={{ color: '#0d9e9e' }}>status</code> — HTTP status number (e.g. 200)<br />
                    <code style={{ color: '#0d9e9e' }}>body</code> — parsed response body (JSON object or string)<br />
                    <code style={{ color: '#0d9e9e' }}>headers</code> — response headers object<br />
                    <code style={{ color: '#0d9e9e' }}>variables</code> — current environment variables<br />
                    <code style={{ color: '#0d9e9e' }}>response</code> — full response object (has .status, .body, .headers)
                  </div>

                  {mappingDialog.condition.trim() && (
                    <button
                      className="button-secondary button"
                      onClick={() => setMappingDialog(prev => prev ? { ...prev, condition: '' } : null)}
                      style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#f87171', borderColor: '#f87171' }}
                    >
                      Clear condition (make unconditional)
                    </button>
                  )}
                </div>
              )}

              {/* ── Mappings tab ───────────────────────────────────────── */}
              {mappingDialog.activeTab === 'mappings' && (
                <div>
                  <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                    Extract values from the source response and inject them as variables for downstream requests.
                    Mappings only apply when this edge is followed.
                  </p>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>From response</div>
                    <div style={{ width: 16 }} />
                    <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Save as variable</div>
                    <div style={{ width: 28 }} />
                  </div>

                  {mappingDialog.mappings.map((mapping, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input
                        placeholder="e.g. body.access_token or body.items[0].id"
                        value={mapping.fromExpression}
                        onChange={e => {
                          const updated = [...mappingDialog.mappings];
                          updated[idx] = { ...updated[idx], fromExpression: e.target.value };
                          setMappingDialog(prev => prev ? { ...prev, mappings: updated } : null);
                        }}
                        className="form-input"
                        style={{ flex: 1, fontSize: '0.82rem' }}
                      />
                      <span style={{ color: '#555', flexShrink: 0 }}>→</span>
                      <input
                        placeholder="access_token"
                        value={mapping.toVariable.replace(/^\{\{/, '').replace(/\}\}$/, '')}
                        onChange={e => {
                          const updated = [...mappingDialog.mappings];
                          // Strip any {{ }} the user may have typed
                          const clean = e.target.value.replace(/^\{\{/, '').replace(/\}\}$/, '');
                          updated[idx] = { ...updated[idx], toVariable: clean };
                          setMappingDialog(prev => prev ? { ...prev, mappings: updated } : null);
                        }}
                        className="form-input"
                        style={{ flex: 1, fontSize: '0.82rem', fontFamily: 'monospace' }}
                      />
                      <button
                        className="button-secondary button"
                        onClick={() => {
                          const updated = mappingDialog.mappings.filter((_, i) => i !== idx);
                          setMappingDialog(prev => prev ? { ...prev, mappings: updated } : null);
                        }}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      >✗</button>
                    </div>
                  ))}

                  <button
                    className="button button-secondary"
                    onClick={() => setMappingDialog(prev => prev
                      ? { ...prev, mappings: [...prev.mappings, { fromExpression: '', toVariable: '' }] }
                      : null,
                    )}
                    style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}
                  >
                    + Add Mapping
                  </button>

                  <div style={{ background: '#111', borderRadius: 4, padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#666', lineHeight: 1.6, marginTop: '0.25rem' }}>
                    <span style={{ color: '#555', fontWeight: 600 }}>Expressions: </span>
                    <code style={{ color: '#0d9e9e' }}>body.access_token</code> · <code style={{ color: '#0d9e9e' }}>body.data.id</code> · <code style={{ color: '#0d9e9e' }}>body.items[0].id</code> · <code style={{ color: '#0d9e9e' }}>status</code> · <code style={{ color: '#0d9e9e' }}>headers.x-request-id</code>
                  </div>
                </div>
              )}

              {/* ── Output tab ── */}
              {mappingDialog.activeTab === 'output' && (
                <div>
                  <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                    When this edge is followed, the value of this expression is printed to the execution log.
                    Useful on edges leading to the End node. Leave blank for no output.
                  </p>
                  <input
                    autoFocus
                    placeholder="e.g.  body.description  or  {{access_token}}  or  status"
                    value={mappingDialog.output}
                    onChange={e => setMappingDialog(prev => prev ? { ...prev, output: e.target.value } : null)}
                    className="form-input"
                    style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                  />
                  <div style={{ background: '#111', borderRadius: 4, padding: '0.5rem 0.75rem', fontSize: '0.73rem', color: '#555', lineHeight: 1.7 }}>
                    <code style={{ color: '#0d9e9e' }}>body.description</code> — field from the response body<br />
                    <code style={{ color: '#0d9e9e' }}>body.items.item</code> — nested path<br />
                    <code style={{ color: '#0d9e9e' }}>{'{{access_token}}'}</code> — environment / mapped variable<br />
                    <code style={{ color: '#0d9e9e' }}>status</code> — HTTP status code of the source node
                  </div>
                  {mappingDialog.output.trim() && (
                    <button
                      className="button-secondary button"
                      onClick={() => setMappingDialog(prev => prev ? { ...prev, output: '' } : null)}
                      style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#f87171', borderColor: '#f87171' }}
                    >
                      Clear output
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.75rem 1rem', borderTop: '1px solid #333' }}>
              <button
                className="button button-secondary"
                onClick={handleDeleteEdge}
                style={{ color: '#f87171', borderColor: '#f87171', marginRight: 'auto' }}
              >
                Delete edge
              </button>
              <button className="button button-secondary" onClick={() => setMappingDialog(null)}>Cancel</button>
              <button className="button" onClick={handleSaveEdgeDialog}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delay config dialog */}
      {delayConfigNodeId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '1.5rem', width: 300 }}>
            <h3 style={{ margin: '0 0 1rem', color: '#fff', fontSize: '0.9rem' }}>⏱ Delay Duration</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
              <input
                type="number"
                min={0}
                value={delayMsDraft}
                onChange={e => setDelayMsDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveDelayConfig()}
                autoFocus
                className="form-input"
                style={{ flex: 1, fontSize: '0.9rem' }}
              />
              <span style={{ color: '#888', fontSize: '0.85rem' }}>ms</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="button button-secondary" onClick={() => setDelayConfigNodeId(null)}>Cancel</button>
              <button className="button" onClick={handleSaveDelayConfig}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ForEach config dialog */}
      {foreachConfigNodeId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '1.5rem', width: 480 }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '0.9rem' }}>↻ Configure For Each</h3>
            <p style={{ color: '#888', fontSize: '0.78rem', margin: '0 0 1rem', lineHeight: 1.6 }}>
              Connect the <strong style={{ color: '#818cf8' }}>body</strong> handle (bottom-left) to the request(s) to run per item.
              Connect the <strong style={{ color: '#22c55e' }}>done</strong> handle (bottom-right) to continue after all items complete.
            </p>

            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label style={{ color: '#aaa', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Array source</label>
              <input
                placeholder="e.g. body.items.item  or  item"
                value={foreachExprDraft}
                onChange={e => setForeachExprDraft(e.target.value)}
                autoFocus
                className="form-input"
                style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: '0.72rem', color: '#555', marginTop: 4 }}>
                Use a <code style={{ color: '#0d9e9e' }}>body.x.y</code> path from the last response, or a variable name mapped from a previous edge.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#aaa', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Item variable prefix</label>
              <input
                placeholder="item"
                value={foreachItemVarDraft}
                onChange={e => setForeachItemVarDraft(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.82rem', fontFamily: 'monospace', width: 140 }}
              />
              <div style={{ fontSize: '0.72rem', color: '#555', marginTop: 4 }}>
                Fields injected as <code style={{ color: '#0d9e9e' }}>{`{{${foreachItemVarDraft || 'item'}_fieldName}}`}</code>.
                Full item JSON as <code style={{ color: '#0d9e9e' }}>{`{{${foreachItemVarDraft || 'item'}}}`}</code>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="button button-secondary" onClick={() => setForeachConfigNodeId(null)}>Cancel</button>
              <button className="button" onClick={handleSaveForeachConfig}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Debug config dialog */}
      {debugConfigNodeId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #333' }}>
              <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.9rem' }}>{'{}'} Debug Script</span>
              <button onClick={() => setDebugConfigNodeId(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                Write JavaScript to inspect variables mid-flow. Use <code style={{ background: '#111', padding: '0 3px', borderRadius: 3, color: '#0d9e9e' }}>console.log()</code> — output appears in the execution log in teal.
                This node is always a pass-through and never stops the flow.
              </p>
              <textarea
                autoFocus
                className="form-textarea"
                value={debugScriptDraft}
                onChange={e => setDebugScriptDraft(e.target.value)}
                placeholder={`// Inspect variables injected by For Each:\nconsole.log('item:', JSON.stringify(variables.item, null, 2));\nconsole.log('uuid:', variables.item_uuid);\n\n// Check the last response:\nconsole.log('status:', status);\nconsole.log('body:', JSON.stringify(body, null, 2));\n\n// All current variables:\nconsole.log('vars:', JSON.stringify(variables, null, 2));`}
                style={{ minHeight: 200, fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical' }}
                spellCheck={false}
              />
              <div style={{ background: '#111', borderRadius: 4, padding: '0.5rem 0.75rem', marginTop: '0.75rem', fontSize: '0.73rem', color: '#555', lineHeight: 1.7 }}>
                <code style={{ color: '#0d9e9e' }}>body</code> — last response body ·{' '}
                <code style={{ color: '#0d9e9e' }}>status</code> — last HTTP status ·{' '}
                <code style={{ color: '#0d9e9e' }}>variables</code> — all current variables (including For Each injections) ·{' '}
                <code style={{ color: '#0d9e9e' }}>headers</code> — last response headers
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0.75rem 1rem', borderTop: '1px solid #333' }}>
              <button className="button button-secondary" onClick={() => setDebugConfigNodeId(null)}>Cancel</button>
              <button className="button" onClick={handleSaveDebugConfig}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
