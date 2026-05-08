import { Runner, RunnerNode, RunnerNodeResult, Collection, Environment, Certificate, ApiResponse } from '../types';
import { HttpService } from './httpService';

function extractValue(response: ApiResponse, expression: string): string {
  const parts = expression.split('.');
  const root = parts[0];

  if (root === 'status') {
    return String(response.status);
  }

  if (root === 'statusText') {
    return String(response.statusText);
  }

  if (root === 'headers') {
    const headerKey = parts.slice(1).join('.').toLowerCase();
    const headerValue = response.headers[headerKey] || response.headers[Object.keys(response.headers).find(k => k.toLowerCase() === headerKey) || ''];
    return String(headerValue ?? '');
  }

  if (root === 'body') {
    const path = parts.slice(1);
    let current: any = response.data;
    for (const key of path) {
      if (current == null) return '';
      current = current[key];
    }
    return current != null ? String(current) : '';
  }

  return '';
}

function applyMappings(
  response: ApiResponse,
  edgeMappings: { fromExpression: string; toVariable: string }[],
  envVariables: Record<string, string>
): Record<string, string> {
  const updated = { ...envVariables };
  for (const mapping of edgeMappings) {
    const value = extractValue(response, mapping.fromExpression.trim());
    if (value !== '') {
      // Strip {{ }} if the user accidentally included them
      const varName = mapping.toVariable.trim().replace(/^\{\{/, '').replace(/\}\}$/, '');
      if (varName) {
        updated[varName] = value;
      }
    }
  }
  return updated;
}

export async function executeRunner(
  runner: Runner,
  collection: Collection,
  environment: Environment | null,
  certificates: Certificate[],
  onNodeStatusChange: (nodeId: string, result: RunnerNodeResult) => void
): Promise<void> {
  // Build adjacency list: nodeId → next nodeId
  const nextNode: Record<string, string> = {};
  const edgeMappings: Record<string, { fromExpression: string; toVariable: string }[]> = {};

  for (const edge of runner.edges) {
    nextNode[edge.source] = edge.target;
    if (edge.data?.mappings?.length) {
      edgeMappings[edge.source] = edge.data.mappings;
    }
  }

  // Find start node
  const startNode = runner.nodes.find(n => n.type === 'start');
  if (!startNode) return;

  // Local copy of env variables for passing data between requests
  let localVars: Record<string, string> = environment
    ? { ...environment.variables }
    : {};

  // Walk the sequence
  let currentNodeId: string | undefined = startNode.id;

  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'running' });
  await delay(100);
  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'success' });

  currentNodeId = nextNode[startNode.id];

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
      // Find the request in the collection
      let request = collection.requests.find(r => r.id === node.data.requestId);
      if (!request) {
        // Search in folders
        for (const folder of collection.folders || []) {
          const found = folder.requests.find(r => r.id === node.data.requestId);
          if (found) { request = found; break; }
        }
      }

      if (!request) {
        onNodeStatusChange(node.id, {
          nodeId: node.id,
          status: 'error',
          error: 'Request not found in collection',
        });
        break;
      }

      onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });

      try {
        // Build a merged environment using localVars
        const mergedEnvironment: Environment = environment
          ? { ...environment, variables: localVars }
          : { id: 'runner-env', name: 'Runner', variables: localVars };

        const response = await HttpService.executeRequest(request, mergedEnvironment, certificates, collection);

        // Apply mappings from the outgoing edge (source = this node)
        const mappings = edgeMappings[node.id];
        if (mappings) {
          localVars = applyMappings(response, mappings, localVars);
        }

        onNodeStatusChange(node.id, {
          nodeId: node.id,
          status: response.status >= 400 || response.status === 0 ? 'error' : 'success',
          response,
        });
      } catch (err: any) {
        onNodeStatusChange(node.id, {
          nodeId: node.id,
          status: 'error',
          error: err.message || String(err),
        });
        break;
      }
    }

    currentNodeId = nextNode[currentNodeId];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
