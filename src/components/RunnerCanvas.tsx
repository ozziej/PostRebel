import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  addEdge,
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
  Runner, RunnerNode, RunnerEdge, RunnerNodeResult,
  Collection, Environment, Certificate, ApiRequest, ApiResponse, DataMapping,
} from '../types';
import { StartNode, RequestNode, EndNode } from './RunnerNodes';
import { executeRunner } from '../utils/runnerExecutor';

// Node types must be defined outside the component to avoid re-creation on render
const nodeTypes: NodeTypes = {
  start: StartNode as any,
  request: RequestNode as any,
  end: EndNode as any,
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
  mappings: DataMapping[];
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
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const response = result.response;

  return (
    <div style={{
      width: 380,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid #2a2a2a',
      background: '#0f0f0f',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #2a2a2a',
        background: '#1a1a1a',
        flexShrink: 0,
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
        <span style={{
          flex: 1, fontSize: '0.82rem', color: '#e0e0e0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {nodeLabel}
        </span>
        {response && (
          <span style={{
            fontWeight: 700, fontSize: '0.82rem',
            color: statusColor(response.status),
            flexShrink: 0,
          }}>
            {response.status} {response.statusText}
          </span>
        )}
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'none', border: 'none', color: '#666',
            cursor: 'pointer', fontSize: '1rem', padding: '0 2px', lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* No response (pure network error) */}
      {!response && result.error && (
        <div style={{ padding: '1rem', color: '#f87171', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Network Error</div>
          <div style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>{result.error}</div>
        </div>
      )}

      {response && (
        <>
          {/* Stats bar */}
          <div style={{
            display: 'flex', gap: 16,
            padding: '0.35rem 0.75rem',
            borderBottom: '1px solid #222',
            fontSize: '0.75rem', color: '#777', flexShrink: 0,
          }}>
            <span>{response.time} ms</span>
            <span>{(response.size / 1024).toFixed(1)} KB</span>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #222',
            flexShrink: 0, background: '#141414',
          }}>
            {(['body', 'headers'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: tab === t ? '2px solid #0d7377' : '2px solid transparent',
                  color: tab === t ? '#0d9e9e' : '#888',
                  padding: '0.35rem 0.75rem',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: tab === t ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {t}
                {t === 'headers' && (
                  <span style={{ marginLeft: 4, fontSize: '0.7rem', color: '#555' }}>
                    ({Object.keys(response.headers).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          {tab === 'body' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem' }}>
              {response.data === null || response.data === undefined || response.data === '' ? (
                <div style={{ color: '#555', fontSize: '0.82rem', fontStyle: 'italic' }}>
                  Empty response body
                </div>
              ) : (
                <pre style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: '#d4d4d4',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.55,
                }}>
                  {formatBody(response.data)}
                </pre>
              )}
            </div>
          )}

          {/* Headers */}
          {tab === 'headers' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {Object.entries(response.headers).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    padding: '0.3rem 0.75rem',
                    borderBottom: '1px solid #1a1a1a',
                    gap: 8,
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ color: '#0d9e9e', flexShrink: 0, minWidth: 140, wordBreak: 'break-all' }}>
                    {key}
                  </span>
                  <span style={{ color: '#d4d4d4', wordBreak: 'break-all' }}>
                    {value}
                  </span>
                </div>
              ))}
              {Object.keys(response.headers).length === 0 && (
                <div style={{ padding: '1rem', color: '#555', fontSize: '0.82rem', fontStyle: 'italic' }}>
                  No headers
                </div>
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
  const [isRunning, setIsRunning] = useState(false);
  const [mappingDialog, setMappingDialog] = useState<MappingDialogState | null>(null);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [runnerName, setRunnerName] = useState(runner.name);

  const allRequests: ApiRequest[] = [
    ...collection.requests,
    ...(collection.folders?.flatMap(f => f.requests) || []),
  ];

  const findRequest = useCallback((requestId: string) =>
    allRequests.find(r => r.id === requestId),
  [allRequests]);

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
      },
    })),
  [findRequest]);

  const toFlowEdges = useCallback((edges: RunnerEdge[]): Edge[] =>
    edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0d7377' },
      style: { stroke: '#0d7377', strokeWidth: 2 },
      label: e.data?.mappings?.length
        ? `${e.data.mappings.length} mapping${e.data.mappings.length > 1 ? 's' : ''}`
        : undefined,
      labelStyle: { fill: '#aaa', fontSize: 10 },
      labelBgStyle: { fill: '#1a2d2d' },
      data: e.data,
    })),
  []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(runner.nodes, {}, null),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(runner.edges),
  );
  const runnerRef = useRef(runner);

  // Sync when the runner changes (different runner selected)
  useEffect(() => {
    runnerRef.current = runner;
    setRunnerName(runner.name);
    setNodes(toFlowNodes(runner.nodes, {}, null));
    setEdges(toFlowEdges(runner.edges));
    setNodeResults({});
    setSelectedNodeId(null);
  }, [runner.id]);

  // Refresh node data whenever results or selection changes
  useEffect(() => {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: {
        ...n.data,
        result: nodeResults[n.id],
        isSelected: n.id === selectedNodeId,
      },
    })));
  }, [nodeResults, selectedNodeId]);

  // ── Node click: open inline panel ──────────────────────────────────────────

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const result = nodeResults[node.id];
    const hasViewable = result && (result.status === 'success' || result.status === 'error');
    if (!hasViewable) return;
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
  }, [nodeResults]);

  // ── Build Runner from current flow state ───────────────────────────────────

  const buildRunnerFromFlow = useCallback((): Runner => {
    const runnerNodes: RunnerNode[] = nodes.map(n => ({
      id: n.id,
      type: n.type as 'start' | 'request' | 'end',
      position: n.position,
      data: {
        label: (n.data.label as string) || '',
        requestId: n.data.requestId as string | undefined,
      },
    }));

    const runnerEdges: RunnerEdge[] = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      data: (e.data as any)?.mappings ? { mappings: (e.data as any).mappings } : undefined,
    }));

    return {
      ...runnerRef.current,
      name: runnerName,
      nodes: runnerNodes,
      edges: runnerEdges,
      updatedAt: new Date().toISOString(),
    };
  }, [nodes, edges, runnerName]);

  const handleSave = useCallback(() => {
    const updated = buildRunnerFromFlow();
    runnerRef.current = updated;
    onSave(updated);
  }, [buildRunnerFromFlow, onSave]);

  const handleConnect = useCallback((params: Connection) => {
    setEdges(prev => addEdge({
      ...params,
      id: `edge-${Date.now()}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0d7377' },
      style: { stroke: '#0d7377', strokeWidth: 2 },
    }, prev));
  }, [setEdges]);

  const handleEdgeClick = useCallback((_: any, edge: Edge) => {
    const currentMappings = (edge.data as any)?.mappings || [];
    setMappingDialog({ edgeId: edge.id, mappings: [...currentMappings] });
  }, []);

  const handleAddRequest = useCallback((request: ApiRequest) => {
    const newNodeId = `node-${Date.now()}`;
    const maxY = Math.max(...nodes.map(n => n.position.y), 0);
    const xPos = nodes.find(n => (n as any).type === 'end')?.position.x ?? 250;

    const newNode: Node = {
      id: newNodeId,
      type: 'request',
      position: { x: xPos, y: maxY + 120 },
      data: { label: request.name, requestId: request.id, method: request.method },
    };

    setNodes(prev =>
      prev.map(n =>
        (n as any).type === 'end'
          ? { ...n, position: { ...n.position, y: maxY + 240 } }
          : n,
      ).concat(newNode),
    );
    setShowAddRequest(false);
  }, [nodes, setNodes]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setNodeResults({});
    setSelectedNodeId(null);

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
      );
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, buildRunnerFromFlow, collection, activeEnvironment, certificates]);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(buildRunnerFromFlow(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runnerName}.runner.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildRunnerFromFlow, runnerName]);

  const handleImport = useCallback(async () => {
    const result = await window.electronAPI.selectJsonFile();
    if (result.success && result.content) {
      try {
        const imported: Runner = JSON.parse(result.content);
        setNodes(toFlowNodes(imported.nodes, {}, null));
        setEdges(toFlowEdges(imported.edges));
        setRunnerName(imported.name || runnerName);
        setNodeResults({});
        setSelectedNodeId(null);
      } catch {
        alert('Invalid runner JSON file');
      }
    }
  }, [toFlowNodes, toFlowEdges, runnerName]);

  const handleSaveMappings = useCallback(() => {
    if (!mappingDialog) return;
    setEdges(prev => prev.map(e => {
      if (e.id !== mappingDialog.edgeId) return e;
      const mappings = mappingDialog.mappings.filter(
        m => m.fromExpression.trim() && m.toVariable.trim(),
      );
      return {
        ...e,
        data: mappings.length ? { mappings } : undefined,
        label: mappings.length
          ? `${mappings.length} mapping${mappings.length > 1 ? 's' : ''}`
          : undefined,
        labelStyle: { fill: '#aaa', fontSize: 10 },
        labelBgStyle: { fill: '#1a2d2d' },
      };
    }));
    setMappingDialog(null);
  }, [mappingDialog, setEdges]);

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
        <input
          value={runnerName}
          onChange={e => setRunnerName(e.target.value)}
          onBlur={handleSave}
          style={{
            background: 'transparent', border: '1px solid #333',
            color: '#fff', fontSize: '0.9rem', padding: '0.2rem 0.5rem',
            borderRadius: 4, width: 160,
          }}
        />

        <button
          className="button"
          onClick={handleRun}
          disabled={isRunning}
          style={{ background: isRunning ? '#333' : '#166534', borderColor: '#22c55e', color: '#fff' }}
        >
          {isRunning ? 'Running…' : '▶ Run'}
        </button>

        <div style={{ position: 'relative' }}>
          <button className="button button-secondary" onClick={() => setShowAddRequest(v => !v)}>
            + Add Request
          </button>
          {showAddRequest && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: '#1e1e1e', border: '1px solid #444', borderRadius: 6,
              minWidth: 200, maxHeight: 280, overflowY: 'auto',
              zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              {allRequests.length === 0 ? (
                <div style={{ padding: '0.75rem', color: '#666', fontSize: '0.8rem' }}>
                  No requests in collection
                </div>
              ) : allRequests.map(req => (
                <div
                  key={req.id}
                  onClick={() => handleAddRequest(req)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0.4rem 0.75rem', cursor: 'pointer',
                    fontSize: '0.82rem', color: '#e0e0e0',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    background: '#0d7377', color: '#fff', fontSize: '0.6rem',
                    fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                  }}>
                    {req.method}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {req.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="button button-secondary" onClick={handleSave}>Save</button>
        <button className="button button-secondary" onClick={handleExport} title="Export runner as JSON">Export</button>
        <button className="button button-secondary" onClick={handleImport} title="Import runner from JSON">Import</button>

        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#444' }}>
          Click edge → mappings · Click completed node → response
        </span>
      </div>

      {/* Canvas + optional response panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
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
      </div>

      {/* Mapping dialog */}
      {mappingDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
            padding: '1.5rem', minWidth: 420, maxWidth: 560, maxHeight: '80vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '1rem' }}>Data Mappings</h3>
            <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              Extract a value from this node's response and save it as a variable for downstream requests.
            </p>

            {/* Column headers */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                From response
              </div>
              <div style={{ width: 16 }} />
              <div style={{ flex: 1, fontSize: '0.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Save as variable
              </div>
              <div style={{ width: 28 }} />
            </div>

            {mappingDialog.mappings.map((mapping, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  placeholder="body.access_token"
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
                {/* Variable name with static {{ }} decorators so it's unambiguous */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid #444', borderRadius: 4, background: '#111', overflow: 'hidden' }}>
                  <span style={{ padding: '0 4px 0 8px', color: '#0d7377', fontSize: '0.82rem', fontFamily: 'monospace', flexShrink: 0, userSelect: 'none' }}>{'{{'}  </span>
                  <input
                    placeholder="access_token"
                    value={mapping.toVariable.replace(/^\{\{/, '').replace(/\}\}$/, '')}
                    onChange={e => {
                      const updated = [...mappingDialog.mappings];
                      updated[idx] = { ...updated[idx], toVariable: e.target.value };
                      setMappingDialog(prev => prev ? { ...prev, mappings: updated } : null);
                    }}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      color: '#e0e0e0', fontSize: '0.82rem', padding: '0.4rem 0',
                      fontFamily: 'monospace',
                    }}
                  />
                  <span style={{ padding: '0 8px 0 4px', color: '#0d7377', fontSize: '0.82rem', fontFamily: 'monospace', flexShrink: 0, userSelect: 'none' }}>{'}}'}</span>
                </div>
                <button
                  className="button-secondary button"
                  onClick={() => {
                    const updated = mappingDialog.mappings.filter((_, i) => i !== idx);
                    setMappingDialog(prev => prev ? { ...prev, mappings: updated } : null);
                  }}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                >
                  ✗
                </button>
              </div>
            ))}

            {/* Quick reference */}
            <div style={{ background: '#111', borderRadius: 4, padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.75rem', color: '#666', lineHeight: 1.6 }}>
              <span style={{ color: '#555', fontWeight: 600 }}>Expression examples: </span>
              <code style={{ color: '#0d9e9e' }}>body.access_token</code>
              {' · '}
              <code style={{ color: '#0d9e9e' }}>body.data.id</code>
              {' · '}
              <code style={{ color: '#0d9e9e' }}>status</code>
              {' · '}
              <code style={{ color: '#0d9e9e' }}>headers.x-request-id</code>
            </div>

            <button
              className="button button-secondary"
              onClick={() => setMappingDialog(prev => prev
                ? { ...prev, mappings: [...prev.mappings, { fromExpression: '', toVariable: '' }] }
                : null,
              )}
              style={{ marginBottom: '1rem', fontSize: '0.82rem' }}
            >
              + Add Mapping
            </button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="button button-secondary" onClick={() => setMappingDialog(null)}>Cancel</button>
              <button className="button" onClick={handleSaveMappings}>Save Mappings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
