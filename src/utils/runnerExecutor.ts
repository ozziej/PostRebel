import {
  Runner, RunnerEdge, RunnerNodeResult, RunnerLogEntry,
  Collection, Environment, Certificate, ApiRequest, ApiResponse,
} from '../types';
import { HttpService } from './httpService';

// ── Path walking (shared by extractValue + extractArray) ──────────────────────

function walkPath(data: any, segments: string[]): any {
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    // Handle bracket indices: "item[0]" → ["item", "0"]
    const tokens = segment.split(/\[(\d+)\]/).filter(t => t !== '');
    for (const token of tokens) {
      if (current == null) return undefined;
      const idx = Number(token);
      current = Number.isNaN(idx) ? current[token] : current[idx];
    }
  }
  return current;
}

// ── Value extraction ──────────────────────────────────────────────────────────

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
    const value = walkPath(response.data, parts.slice(1));
    if (value == null) return '';
    if (Array.isArray(value) || (typeof value === 'object')) return JSON.stringify(value);
    return String(value);
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

// ── Script variable preparation ──────────────────────────────────────────────
// Variables are stored as strings. Values that look like JSON objects or arrays
// are pre-parsed so scripts can use dot notation: variables.item.id instead of
// JSON.parse(variables.item).id

function parseVarsForScript(vars: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value && (value.startsWith('{') || value.startsWith('['))
               && (value.endsWith('}')  || value.endsWith(']'))) {
      try { out[key] = JSON.parse(value); continue; } catch { /* keep as string */ }
    }
    out[key] = value;
  }
  return out;
}

// ── Condition evaluation ──────────────────────────────────────────────────────
//
// Available in scripts: response, body, status, headers, variables, console
// Script must explicitly return true/false.

export function evaluateCondition(
  script: string,
  response: ApiResponse,
  variables: Record<string, string>,
  onLog?: (entry: RunnerLogEntry) => void,
): { passed: boolean; error?: string } {
  try {
    const body = response.data;
    const status = response.status;
    const headers = response.headers;

    const mockConsole = {
      log: (...args: any[]) => onLog?.({ level: 'script', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }),
      warn: (...args: any[]) => onLog?.({ level: 'script', message: 'warn: ' + args.map(String).join(' ') }),
      error: (...args: any[]) => onLog?.({ level: 'script', message: 'error: ' + args.map(String).join(' ') }),
    };

    const fn = new Function(
      'response', 'body', 'status', 'headers', 'variables', 'console',
      '"use strict";\n' + script,
    );

    const result = fn(
      { status, statusText: response.statusText, headers, body, data: response.data },
      body, status, headers, parseVarsForScript(variables), mockConsole,
    );

    return { passed: Boolean(result) };
  } catch (err: any) {
    return { passed: false, error: err.message || String(err) };
  }
}

// ── Request resolver (substitutes {{vars}} for display purposes only) ─────────

function resolveRequest(request: ApiRequest, vars: Record<string, string>): ApiRequest {
  const sub = (text: string): string =>
    text.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
      const dot = key.indexOf('.');
      if (dot === -1) return vars[key] ?? match;
      const root = vars[key.slice(0, dot)];
      if (!root) return match;
      try {
        let val: any = JSON.parse(root);
        for (const p of key.slice(dot + 1).split('.')) {
          if (val == null) return match;
          val = val[p];
        }
        return val != null ? String(val) : match;
      } catch { return match; }
    });

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    headers[sub(k)] = sub(v);
  }

  let body = request.body;
  if (body?.type === 'raw' && typeof body.data === 'string') {
    body = { ...body, data: sub(body.data) };
  }

  let auth = request.auth;
  if (auth) {
    if (auth.type === 'bearer' && auth.bearer)
      auth = { ...auth, bearer: sub(auth.bearer) };
    else if (auth.type === 'basic' && auth.basic)
      auth = { ...auth, basic: { username: sub(auth.basic.username), password: sub(auth.basic.password) } };
    else if (auth.type === 'jwt' && auth.jwt)
      auth = { ...auth, jwt: sub(auth.jwt) };
  }

  return { ...request, url: sub(request.url), headers, body, auth };
}

// ── Debug script evaluation ───────────────────────────────────────────────────
// Like evaluateCondition but: works with null response, never returns a value,
// and uses prettier JSON.stringify for console.log output.

function evaluateDebugScript(
  script: string,
  lastResponse: ApiResponse | null,
  variables: Record<string, string>,
  onLog?: (entry: RunnerLogEntry) => void,
): void {
  try {
    const body = lastResponse?.data ?? null;
    const status = lastResponse?.status ?? 0;
    const headers = lastResponse?.headers ?? {};

    const fmt = (a: any) =>
      typeof a === 'object' && a !== null ? JSON.stringify(a, null, 2) : String(a);

    const mockConsole = {
      log:   (...args: any[]) => onLog?.({ level: 'script', message: args.map(fmt).join(' ') }),
      warn:  (...args: any[]) => onLog?.({ level: 'warn',   message: 'warn: '  + args.map(fmt).join(' ') }),
      error: (...args: any[]) => onLog?.({ level: 'error',  message: 'error: ' + args.map(fmt).join(' ') }),
    };

    const fn = new Function(
      'response', 'body', 'status', 'headers', 'variables', 'console',
      '"use strict";\n' + script,
    );

    fn(
      lastResponse
        ? { status, statusText: lastResponse.statusText, headers, body, data: lastResponse.data }
        : null,
      body, status, headers, parseVarsForScript(variables), mockConsole,
    );
  } catch (err: any) {
    onLog?.({ level: 'error', message: `Debug error: ${err.message || String(err)}` });
  }
}

// ── ForEach helpers ───────────────────────────────────────────────────────────

function extractArray(
  expression: string,
  lastResponse: ApiResponse | null,
  localVars: Record<string, string>,
): any[] {
  const trimmed = expression.trim();

  // "body" alone = the response body IS the array
  // "body.field" = dot-notation path into the body
  if ((trimmed === 'body' || trimmed.startsWith('body.')) && lastResponse) {
    const value = trimmed === 'body'
      ? lastResponse.data
      : walkPath(lastResponse.data, trimmed.slice(5).split('.').filter(Boolean));
    return Array.isArray(value) ? value : [];
  }

  // variable reference (bare name or {{name}})
  const varName = trimmed.replace(/^\{\{/, '').replace(/\}\}$/, '');
  try {
    const raw = localVars[varName];
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function injectItemVars(
  item: any,
  itemVar: string,
  localVars: Record<string, string>,
): Record<string, string> {
  const updated = { ...localVars };
  // {{itemVar}} = full JSON
  updated[itemVar] = typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
  // {{itemVar_fieldName}} = flattened first-level fields
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    for (const [key, val] of Object.entries(item)) {
      updated[`${itemVar}_${key}`] = val != null ? String(val) : '';
    }
  }
  return updated;
}

// ── Sequence execution context ────────────────────────────────────────────────

interface SeqCtx {
  runner: Runner;
  collection: Collection;
  environment: Environment | null;
  certificates: Certificate[];
  outgoingEdges: Record<string, RunnerEdge[]>;
  onNodeStatusChange: (nodeId: string, result: RunnerNodeResult) => void;
  onEdgeFollowed?: (edgeId: string) => void;
  onLog?: (entry: RunnerLogEntry) => void;
}

// ── Core sequence runner (called recursively for forEach bodies) ──────────────

async function runSequence(
  startNodeId: string,
  localVars: Record<string, string>,
  lastResponse: ApiResponse | null,
  ctx: SeqCtx,
): Promise<{ localVars: Record<string, string>; lastResponse: ApiResponse | null }> {
  let vars = { ...localVars };
  let resp = lastResponse;
  let currentNodeId: string | undefined = startNodeId;

  while (currentNodeId) {
    const node = ctx.runner.nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    // ── End ──────────────────────────────────────────────────────────────────
    if (node.type === 'end') {
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      await pause(100);
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'success' });
      ctx.onLog?.({ level: 'success', message: 'Runner completed' });
      break;
    }

    // ── Delay ────────────────────────────────────────────────────────────────
    if (node.type === 'delay') {
      const ms = (node.data.delayMs as number | undefined) ?? 1000;
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      ctx.onLog?.({ level: 'info', message: `⏱ Waiting ${ms}ms…` });
      await pause(ms);
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'success' });
      const nextEdge = ctx.outgoingEdges[node.id]?.[0];
      if (!nextEdge) break;
      ctx.onEdgeFollowed?.(nextEdge.id);
      currentNodeId = nextEdge.target;
      continue;
    }

    // ── Debug ─────────────────────────────────────────────────────────────────
    if (node.type === 'debug') {
      const script = (node.data.debugScript as string | undefined)?.trim() || '';
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      ctx.onLog?.({ level: 'info', message: `{} Debug` });
      if (script) {
        evaluateDebugScript(script, resp, vars, ctx.onLog);
      } else {
        ctx.onLog?.({ level: 'warn', message: 'Debug node has no script — click it to add one' });
      }
      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'success' });
      const nextEdge = ctx.outgoingEdges[node.id]?.[0];
      if (!nextEdge) break;
      ctx.onEdgeFollowed?.(nextEdge.id);
      currentNodeId = nextEdge.target;
      continue;
    }

    // ── ForEach ──────────────────────────────────────────────────────────────
    if (node.type === 'foreach') {
      const expression = (node.data.foreachExpression as string | undefined) || '';
      const itemVar = (node.data.foreachItemVar as string | undefined) || 'item';
      const array = extractArray(expression, resp, vars);

      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      ctx.onLog?.({ level: 'info', message: `↻ For Each: ${array.length} item${array.length !== 1 ? 's' : ''} from "${expression}"` });

      const allEdges = ctx.outgoingEdges[node.id] || [];
      const bodyEdge = allEdges.find(e => e.sourceHandle === 'body');
      const doneEdge = allEdges.find(e => e.sourceHandle === 'done');

      for (let i = 0; i < array.length; i++) {
        ctx.onLog?.({ level: 'info', message: `↻ Item ${i + 1} / ${array.length}` });
        const itemVars = injectItemVars(array[i], itemVar, vars);
        if (bodyEdge) {
          ctx.onEdgeFollowed?.(bodyEdge.id);
          await runSequence(bodyEdge.target, itemVars, resp, ctx);
        }
      }

      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'success' });
      ctx.onLog?.({ level: 'success', message: `↻ For Each: all ${array.length} items done` });

      if (!doneEdge) break;
      if (doneEdge.data?.mappings?.length && resp) {
        vars = applyMappings(resp, doneEdge.data.mappings, vars);
      }
      ctx.onEdgeFollowed?.(doneEdge.id);
      currentNodeId = doneEdge.target;
      continue;
    }

    // ── Request ──────────────────────────────────────────────────────────────
    if (node.type === 'request') {
      let request = ctx.collection.requests.find(r => r.id === node.data.requestId);
      if (!request) {
        for (const folder of ctx.collection.folders || []) {
          const found = folder.requests.find(r => r.id === node.data.requestId);
          if (found) { request = found; break; }
        }
      }

      if (!request) {
        ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'error', error: 'Request not found in collection' });
        ctx.onLog?.({ level: 'error', message: `✗ ${node.data.label}: request not found in collection` });
        break;
      }

      ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'running' });
      ctx.onLog?.({ level: 'info', message: `→ Executing: ${request.name}` });

      let response: ApiResponse;
      try {
        const mergedEnv: Environment = ctx.environment
          ? { ...ctx.environment, variables: vars }
          : { id: 'runner-env', name: 'Runner', variables: vars };

        response = await HttpService.executeRequest(request, mergedEnv, ctx.certificates, ctx.collection);
        resp = response;

        const ok = response.status >= 200 && response.status < 400;
        ctx.onNodeStatusChange(node.id, {
          nodeId: node.id,
          status: response.status >= 400 || response.status === 0 ? 'error' : 'success',
          response,
          request: resolveRequest(request, vars),
        });
        ctx.onLog?.({
          level: ok ? 'success' : 'warn',
          message: `${ok ? '✓' : '!'} ${request.name} → ${response.status} ${response.statusText}`,
        });
      } catch (err: any) {
        ctx.onNodeStatusChange(node.id, { nodeId: node.id, status: 'error', error: err.message || String(err), request: resolveRequest(request, vars) });
        ctx.onLog?.({ level: 'error', message: `✗ ${request.name}: ${err.message || String(err)}` });
        break;
      }

      // Pick outgoing edge (conditional edges first, unconditional as fallback)
      const edges = ctx.outgoingEdges[node.id] || [];
      let followedEdge: RunnerEdge | null = null;

      for (const edge of edges) {
        const condScript = edge.data?.condition?.trim();
        if (!condScript) {
          followedEdge = edge;
          break;
        }
        const abbrev = condScript.replace(/^return\s+/, '').replace(/;$/, '').slice(0, 50);
        const { passed, error } = evaluateCondition(condScript, response, vars, ctx.onLog);
        if (error) {
          ctx.onLog?.({ level: 'error', message: `Condition error: ${error}` });
        } else {
          ctx.onLog?.({
            level: passed ? 'success' : 'info',
            message: `${passed ? '✓' : '✗'} if (${abbrev}) → ${passed ? 'followed' : 'skipped'}`,
          });
        }
        if (passed) { followedEdge = edge; break; }
      }

      if (!followedEdge) break;

      // Apply mappings and log them
      if (followedEdge.data?.mappings?.length) {
        const newVars = applyMappings(response, followedEdge.data.mappings, vars);
        for (const m of followedEdge.data.mappings) {
          const varName = m.toVariable.trim().replace(/^\{\{/, '').replace(/\}\}$/, '');
          const val = newVars[varName];
          if (varName && val !== undefined && val !== '') {
            const display = val.length > 60 ? val.slice(0, 60) + '…' : val;
            ctx.onLog?.({ level: 'info', message: `↦ ${m.fromExpression} → {{${varName}}} = "${display}"` });
          }
        }
        vars = newVars;
      }

      // Log edge output expression if set
      const outputExpr = followedEdge.data?.output?.trim();
      if (outputExpr) {
        let value = '';
        if (outputExpr.startsWith('{{') && outputExpr.endsWith('}}')) {
          value = vars[outputExpr.slice(2, -2).trim()] ?? '';
        } else {
          value = extractValue(response, outputExpr);
        }
        ctx.onLog?.({
          level: value ? 'success' : 'warn',
          message: value
            ? `▶ ${outputExpr}: ${value}`
            : `▶ ${outputExpr}: (empty or not found)`,
        });
      }

      ctx.onEdgeFollowed?.(followedEdge.id);
      currentNodeId = followedEdge.target;
    } else {
      break; // unknown node type
    }
  }

  return { localVars: vars, lastResponse: resp };
}

// ── Main exported executor ────────────────────────────────────────────────────

export async function executeRunner(
  runner: Runner,
  collection: Collection,
  environment: Environment | null,
  certificates: Certificate[],
  onNodeStatusChange: (nodeId: string, result: RunnerNodeResult) => void,
  onEdgeFollowed?: (edgeId: string) => void,
  onLog?: (entry: RunnerLogEntry) => void,
): Promise<void> {
  // Build outgoing edge map; conditional edges sorted first (unconditional = else fallback)
  const outgoingEdges: Record<string, RunnerEdge[]> = {};
  for (const edge of runner.edges) {
    if (!outgoingEdges[edge.source]) outgoingEdges[edge.source] = [];
    outgoingEdges[edge.source].push(edge);
  }
  for (const nodeId of Object.keys(outgoingEdges)) {
    outgoingEdges[nodeId].sort((a, b) => {
      const ac = !!(a.data?.condition?.trim());
      const bc = !!(b.data?.condition?.trim());
      if (ac && !bc) return -1;
      if (!ac && bc) return 1;
      return 0;
    });
  }

  const startNode = runner.nodes.find(n => n.type === 'start');
  if (!startNode) return;

  let localVars: Record<string, string> = environment ? { ...environment.variables } : {};
  for (const { key, value } of (startNode.data.variables ?? [])) {
    if (key.trim()) localVars[key.trim()] = value;
  }

  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'running' });
  await pause(100);
  onNodeStatusChange(startNode.id, { nodeId: startNode.id, status: 'success' });
  onLog?.({ level: 'info', message: '▶ Runner started' });

  const startEdge = outgoingEdges[startNode.id]?.[0];
  if (!startEdge) return;
  onEdgeFollowed?.(startEdge.id);

  const ctx: SeqCtx = {
    runner, collection, environment, certificates,
    outgoingEdges, onNodeStatusChange, onEdgeFollowed, onLog,
  };

  await runSequence(startEdge.target, localVars, null, ctx);
}

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
