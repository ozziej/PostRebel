import { Runner, RunnerEdge, RunnerNodeResult, Collection, Environment, Certificate, ApiResponse } from '../types';
import { HttpService } from './httpService';

// ── Value extraction (dot-notation paths into a response) ─────────────────────

function extractValue(response: ApiResponse, expression: string): string {
  const parts = expression.split('.');
  const root = parts[0];

  if (root === 'status') return String(response.status);
  if (root === 'statusText') return String(response.statusText);

  if (root === 'headers') {
    const headerKey = parts.slice(1).join('.').toLowerCase();
    const match = Object.keys(response.headers).find(k => k.toLowerCase() === headerKey);
    return match ? String(response.headers[match]) : '';
  }

  if (root === 'body') {
    // Split on dots, but each segment may contain one or more array indices, e.g.
    //   "advanceBalance.advances[0].advancesUuid"
    //   "items[0][2].name"
    // Strategy: split the full path (after "body.") on "." then for each segment
    // further split on "[N]" brackets so every token is either a key or a numeric index.
    const path = parts.slice(1);
    let current: any = response.data;
    for (const segment of path) {
      if (current == null) return '';
      // Expand "key[0][1]..." into ["key", "0", "1", ...]
      const tokens = segment.split(/\[(\d+)\]/).filter(t => t !== '');
      for (const token of tokens) {
        if (current == null) return '';
        const idx = Number(token);
        current = Number.isNaN(idx) ? current[token] : current[idx];
      }
    }
    return current != null ? String(current) : '';
  }

  return '';
}

// ── Variable mapping ──────────────────────────────────────────────────────────

function applyMappings(
  response: ApiResponse,
  edgeMappings: { fromExpression: string; toVariable: string }[],
  envVariables: Record<string, string>,
): Record<string, string> {
  const updated = { ...envVariables };
  for (const mapping of edgeMappings) {
    const value = extractValue(response, mapping.fromExpression.trim());
    if (value !== '') {
      const varName = mapping.toVariable.trim().replace(/^\{\{/, '').replace(/\}\}$/, '');
      if (varName) updated[varName] = value;
    }
  }
  return updated;
}

// ── Condition evaluation ──────────────────────────────────────────────────────
//
// The condition script has access to:
//   response  – { status, statusText, headers, body }
//   body      – shorthand for response.body (parsed JSON object or string)
//   status    – shorthand for response.status (number)
//   headers   – shorthand for response.headers
//   variables – current environment variables as a plain object
//
// The script must explicitly return true/false, e.g.:
//   return status === 200;
//   return body.success === true;
//   return body.items && body.items.length > 0;

export function evaluateCondition(
  script: string,
  response: ApiResponse,
  variables: Record<string, string>,
): { passed: boolean; error?: string } {
  try {
    const body = response.data;
    const status = response.status;
    const headers = response.headers;

    const fn = new Function(
      'response', 'body', 'status', 'headers', 'variables',
      '"use strict";\n' + script,
    );

    const result = fn(
      { status, statusText: response.statusText, headers, body, data: response.data },
      body,
      status,
      headers,
      { ...variables },
    );

    return { passed: Boolean(result) };
  } catch (err: any) {
    return { passed: false, error: err.message || String(err) };
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeRunner(
  runner: Runner,
  collection: Collection,
  environment: Environment | null,
  certificates: Certificate[],
  onNodeStatusChange: (nodeId: string, result: RunnerNodeResult) => void,
  onEdgeFollowed?: (edgeId: string) => void,
): Promise<void> {
  // Build: sourceNodeId → outgoing edges
  // Conditional edges are sorted before unconditional ones so the unconditional
  // edge acts as the "else" fallback when no condition matches.
  const outgoingEdges: Record<string, RunnerEdge[]> = {};
  for (const edge of runner.edges) {
    if (!outgoingEdges[edge.source]) outgoingEdges[edge.source] = [];
    outgoingEdges[edge.source].push(edge);
  }
  for (const nodeId of Object.keys(outgoingEdges)) {
    outgoingEdges[nodeId].sort((a, b) => {
      const ac = !!(a.data?.condition?.trim());
      const bc = !!(b.data?.condition?.trim());
      if (ac && !bc) return -1; // conditional edges first
      if (!ac && bc) return 1;
      return 0;
    });
  }

  const startNode = runner.nodes.find(n => n.type === 'start');
  if (!startNode) return;

  let localVars: Record<string, string> = environment
    ? { ...environment.variables }
    : {};

  // Apply start-node variable overrides (runner-scoped, don't modify the real environment)
  for (const { key, value } of startNode.data.variables ?? []) {
    if (key.trim()) localVars[key.trim()] = value;
  }

  // Start node
  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'running' });
  await delay(100);
  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'success' });

  // Start always takes its single outgoing edge unconditionally
  const startEdge = outgoingEdges[startNode.id]?.[0];
  if (!startEdge) return;
  onEdgeFollowed?.(startEdge.id);
  let currentNodeId: string | undefined = startEdge.target;

  while (currentNodeId) {
    const node = runner.nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    if (node.type === 'end') {
      onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      await delay(100);
      onNodeStatusChange(node.id, { nodeId: node.id, status: 'success' });
      break;
    }

    if (node.type === 'request') {
      let request = collection.requests.find(r => r.id === node.data.requestId);
      if (!request) {
        for (const folder of collection.folders || []) {
          const found = folder.requests.find(r => r.id === node.data.requestId);
          if (found) { request = found; break; }
        }
      }

      if (!request) {
        onNodeStatusChange(node.id, {
          nodeId: node.id, status: 'error',
          error: 'Request not found in collection',
        });
        break;
      }

      onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });

      let response: ApiResponse;
      try {
        const mergedEnvironment: Environment = environment
          ? { ...environment, variables: localVars }
          : { id: 'runner-env', name: 'Runner', variables: localVars };

        response = await HttpService.executeRequest(request, mergedEnvironment, certificates, collection);

        onNodeStatusChange(node.id, {
          nodeId: node.id,
          status: response.status >= 400 || response.status === 0 ? 'error' : 'success',
          response,
        });
      } catch (err: any) {
        onNodeStatusChange(node.id, {
          nodeId: node.id, status: 'error',
          error: err.message || String(err),
        });
        break;
      }

      // Pick which outgoing edge to follow
      const edges = outgoingEdges[node.id] || [];
      let followedEdge: RunnerEdge | null = null;

      for (const edge of edges) {
        const condScript = edge.data?.condition?.trim();
        if (!condScript) {
          // Unconditional — acts as the else/default
          followedEdge = edge;
          break;
        }
        const { passed } = evaluateCondition(condScript, response, localVars);
        if (passed) {
          followedEdge = edge;
          break;
        }
      }

      if (!followedEdge) break; // No matching edge — stop

      // Apply this specific edge's mappings then follow it
      if (followedEdge.data?.mappings?.length) {
        localVars = applyMappings(response, followedEdge.data.mappings, localVars);
      }

      onEdgeFollowed?.(followedEdge.id);
      currentNodeId = followedEdge.target;
    } else {
      break;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
