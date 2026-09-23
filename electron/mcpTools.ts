import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  listWorkspaces, loadCollections, loadEnvironments, loadRunners, loadCertificates,
} from './workspaceStore';
import { executeHttpConfig } from './httpTransport';
import { flattenRequests, countRequests } from '../src/utils/collectionTree';
import { executeSingleRequest } from '../src/utils/requestExecutor';
import { executeRunner } from '../src/utils/runnerExecutor';
import { ApiRequest, Collection, CollectionFolder, Environment, Runner, RunnerLogEntry, RunnerNodeResult } from '../src/types';

// The MCP tool surface: list/inspect saved workspaces, collections, requests,
// environments, and runners (read-only), plus run_request/run_runner (live
// network calls). All read tools go through the same headless loaders the CLI
// already uses (workspaceStore.ts); the execution tools go through the same
// headless request/runner engine (requestExecutor.ts / runnerExecutor.ts),
// using executeHttpConfig (httpTransport.ts) as the transport — no Electron
// process required, exactly like the CLI.
//
// Unlike the CLI (one workspace per process, via --workspace), this server is
// long-running for a whole agent session, so `workspace` is a parameter on
// every call rather than something configured once at startup.

export interface McpContext {
  workspacesDir: string;
  userDataDir: string;
}

interface ToolResult {
  data: unknown;
  isError?: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: any, ctx: McpContext) => Promise<ToolResult>;
}

function resolveWorkspacePath(ctx: McpContext, workspace: string): string {
  return path.join(ctx.workspacesDir, workspace);
}

// Checks id first (what list_* tools return, safe to pass straight back in),
// then falls back to a case-insensitive name match (what a user/agent is more
// likely to type), mirroring the CLI's existing case-insensitive name lookup.
function findByIdOrName<T extends { id: string }>(items: T[], key: string, getName: (item: T) => string): T | undefined {
  return items.find(item => item.id === key) ?? items.find(item => getName(item).toLowerCase() === key.toLowerCase());
}

// Folder-name breadcrumb per request id, at any depth — presentation-only for
// list_requests' output, so kept local rather than added to collectionTree.ts.
function folderPathsForRequest(collection: Collection): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const request of collection.requests) map.set(request.id, []);
  const walk = (folders: CollectionFolder[] | undefined, prefix: string[]) => {
    for (const folder of folders || []) {
      const folderPath = [...prefix, folder.name];
      for (const request of folder.requests) map.set(request.id, folderPath);
      walk(folder.folders, folderPath);
    }
  };
  walk(collection.folders, []);
  return map;
}

const REDACTED = '<redacted>';

// Never put secret plaintext into a *listing* tool's output — it becomes part
// of the model's context/conversation transcript. Execution tools (run_request/
// run_runner) still use the real values; this only affects inspection output.
function redactAuth(auth: ApiRequest['auth']): ApiRequest['auth'] | undefined {
  if (!auth) return undefined;
  const redacted: any = { ...auth };
  if (redacted.bearer) redacted.bearer = REDACTED;
  if (redacted.basic) redacted.basic = { ...redacted.basic, password: REDACTED };
  if (redacted.jwt) redacted.jwt = REDACTED;
  if (redacted.oauth2) {
    redacted.oauth2 = { ...redacted.oauth2 };
    for (const key of ['clientSecret', 'password', 'refreshToken', 'authorizationCode'] as const) {
      if (redacted.oauth2[key]) redacted.oauth2[key] = REDACTED;
    }
  }
  return redacted;
}

async function resolveCollection(ctx: McpContext, workspace: string, collectionKey: string): Promise<{ collection: Collection } | { error: string }> {
  const collections = await loadCollections(resolveWorkspacePath(ctx, workspace));
  const collection = findByIdOrName(collections, collectionKey, c => c.name);
  if (!collection) {
    return { error: `Collection "${collectionKey}" not found in workspace "${workspace}". Available: ${collections.map(c => c.name).join(', ') || '(none)'}` };
  }
  return { collection };
}

async function resolveEnvironment(ctx: McpContext, workspace: string, environmentKey: string | undefined): Promise<{ environment: Environment | null } | { error: string }> {
  if (!environmentKey) return { environment: null };
  const environments = await loadEnvironments(resolveWorkspacePath(ctx, workspace));
  const environment = findByIdOrName(environments, environmentKey, e => e.name);
  if (!environment) {
    return { error: `Environment "${environmentKey}" not found in workspace "${workspace}". Available: ${environments.map(e => e.name).join(', ') || '(none)'}` };
  }
  return { environment };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'list_workspaces',
    description: 'List every PostRebel workspace on this machine. Returns the folder name to pass as `workspace` to every other tool.',
    inputSchema: {},
    handler: async (_args, ctx) => {
      const workspaces = await listWorkspaces(ctx.workspacesDir);
      return { data: { workspaces: workspaces.map(w => ({ workspace: w.id, name: w.name, path: w.path })) } };
    },
  },
  {
    name: 'list_collections',
    description: 'List the collections in a workspace, with their request and folder counts.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
    },
    handler: async (args, ctx) => {
      const collections = await loadCollections(resolveWorkspacePath(ctx, args.workspace));
      return {
        data: {
          collections: collections.map(c => ({
            id: c.id, name: c.name, requestCount: countRequests(c), folderNames: (c.folders || []).map(f => f.name),
          })),
        },
      };
    },
  },
  {
    name: 'list_requests',
    description: 'List every saved request in a collection (including nested folders), with method, URL, and folder path.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
      collection: z.string().describe('Collection id or name, from list_collections'),
    },
    handler: async (args, ctx) => {
      const resolved = await resolveCollection(ctx, args.workspace, args.collection);
      if ('error' in resolved) return { data: { error: resolved.error }, isError: true };
      const { collection } = resolved;
      const folderPaths = folderPathsForRequest(collection);
      return {
        data: {
          collection: { id: collection.id, name: collection.name },
          requests: flattenRequests(collection).map(r => ({
            id: r.id, name: r.name, method: r.method, url: r.url, folderPath: folderPaths.get(r.id) || [],
          })),
        },
      };
    },
  },
  {
    name: 'get_request',
    description: 'Get the full definition of one saved request (headers, body, auth). Credential values (bearer/basic/jwt/oauth2 secrets) are redacted.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
      collection: z.string().describe('Collection id or name, from list_collections'),
      request: z.string().describe('Request id or name, from list_requests'),
    },
    handler: async (args, ctx) => {
      const resolved = await resolveCollection(ctx, args.workspace, args.collection);
      if ('error' in resolved) return { data: { error: resolved.error }, isError: true };
      const { collection } = resolved;
      const requests = flattenRequests(collection);
      const request = findByIdOrName(requests, args.request, r => r.name);
      if (!request) {
        return { data: { error: `Request "${args.request}" not found in collection "${collection.name}". Available: ${requests.map(r => r.name).join(', ') || '(none)'}` }, isError: true };
      }
      return {
        data: {
          id: request.id, name: request.name, method: request.method, url: request.url, headers: request.headers,
          body: request.body ? { type: request.body.type, rawSubtype: request.body.rawSubtype } : undefined,
          auth: redactAuth(request.auth),
          hasPreRequestScript: !!request.preRequestScript?.trim(),
          hasTestScript: !!request.testScript?.trim(),
        },
      };
    },
  },
  {
    name: 'list_environments',
    description: 'List the environments in a workspace and their variables. Secret variable values are omitted (only the key and isSecret flag are shown).',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
    },
    handler: async (args, ctx) => {
      const environments = await loadEnvironments(resolveWorkspacePath(ctx, args.workspace));
      return {
        data: {
          environments: environments.map(e => {
            const vars = e.variablesArray?.length
              ? e.variablesArray
              : Object.entries(e.variables || {}).map(([key, value]) => ({ key, value, isSecret: false }));
            return {
              id: e.id, name: e.name,
              variables: vars.map(v => ({ key: v.key, isSecret: v.isSecret, value: v.isSecret ? undefined : v.value })),
            };
          }),
        },
      };
    },
  },
  {
    name: 'list_runners',
    description: 'List the saved Collection Runner flows in a workspace, optionally filtered to one collection.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
      collection: z.string().optional().describe('Optional collection id or name to filter to'),
    },
    handler: async (args, ctx) => {
      let runners = await loadRunners(resolveWorkspacePath(ctx, args.workspace));
      if (args.collection) {
        const resolved = await resolveCollection(ctx, args.workspace, args.collection);
        if ('error' in resolved) return { data: { error: resolved.error }, isError: true };
        runners = runners.filter(r => r.collectionId === resolved.collection.id);
      }
      return {
        data: {
          runners: runners.map(r => ({ id: r.id, name: r.name, collectionId: r.collectionId, nodeCount: r.nodes.length, edgeCount: r.edges.length })),
        },
      };
    },
  },
  {
    name: 'run_request',
    description: 'Execute one saved request — makes a real, live network call using its saved method, URL, headers, and auth (including fetching an OAuth2 token if configured). Returns the actual HTTP response.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
      collection: z.string().describe('Collection id or name, from list_collections'),
      request: z.string().describe('Request id or name, from list_requests'),
      environment: z.string().optional().describe('Optional environment id or name to resolve {{variables}} against, from list_environments'),
    },
    handler: async (args, ctx) => {
      const resolvedCollection = await resolveCollection(ctx, args.workspace, args.collection);
      if ('error' in resolvedCollection) return { data: { error: resolvedCollection.error }, isError: true };
      const { collection } = resolvedCollection;

      const requests = flattenRequests(collection);
      const request = findByIdOrName(requests, args.request, r => r.name);
      if (!request) {
        return { data: { error: `Request "${args.request}" not found in collection "${collection.name}". Available: ${requests.map(r => r.name).join(', ') || '(none)'}` }, isError: true };
      }

      const resolvedEnv = await resolveEnvironment(ctx, args.workspace, args.environment);
      if ('error' in resolvedEnv) return { data: { error: resolvedEnv.error }, isError: true };

      const certificates = await loadCertificates(ctx.userDataDir);
      const result = await executeSingleRequest(request, resolvedEnv.environment, certificates, collection, executeHttpConfig);

      return {
        data: {
          request: { id: request.id, name: request.name },
          resolved: result.resolved,
          status: result.response.status,
          statusText: result.response.statusText,
          headers: result.response.headers,
          body: result.response.data,
          time: result.response.time,
          size: result.response.size,
        },
      };
    },
  },
  {
    name: 'run_runner',
    description: 'Execute a saved Collection Runner flow — makes real, live network calls for every request node it visits. Returns the status and response of each node.',
    inputSchema: {
      workspace: z.string().describe('Workspace folder name, from list_workspaces'),
      collection: z.string().describe('Collection id or name, from list_collections'),
      runner: z.string().describe('Runner id or name, from list_runners'),
      environment: z.string().optional().describe('Optional environment id or name to resolve {{variables}} against, from list_environments'),
    },
    handler: async (args, ctx) => {
      const resolvedCollection = await resolveCollection(ctx, args.workspace, args.collection);
      if ('error' in resolvedCollection) return { data: { error: resolvedCollection.error }, isError: true };
      const { collection } = resolvedCollection;

      const candidateRunners = (await loadRunners(resolveWorkspacePath(ctx, args.workspace))).filter(r => r.collectionId === collection.id);
      const runner: Runner | undefined = findByIdOrName(candidateRunners, args.runner, r => r.name);
      if (!runner) {
        return { data: { error: `Runner "${args.runner}" not found for collection "${collection.name}". Available: ${candidateRunners.map(r => r.name).join(', ') || '(none)'}` }, isError: true };
      }

      const resolvedEnv = await resolveEnvironment(ctx, args.workspace, args.environment);
      if ('error' in resolvedEnv) return { data: { error: resolvedEnv.error }, isError: true };

      const certificates = await loadCertificates(ctx.userDataDir);
      const nodeResults: Record<string, RunnerNodeResult> = {};
      const logs: RunnerLogEntry[] = [];
      const startTime = Date.now();

      await executeRunner(
        runner, collection, resolvedEnv.environment, certificates,
        (nodeId, result) => { nodeResults[nodeId] = result; },
        undefined,
        (entry) => { logs.push({ ...entry, timestamp: Date.now() }); },
        undefined,
        executeHttpConfig,
      );

      const durationMs = Date.now() - startTime;
      const hasError = Object.values(nodeResults).some(r => r.status === 'error');
      const reachedEnd = runner.nodes.some(n => n.type === 'end' && nodeResults[n.id]?.status === 'success');

      return {
        data: {
          runner: { id: runner.id, name: runner.name },
          collection: { id: collection.id, name: collection.name },
          environment: resolvedEnv.environment?.name ?? null,
          status: hasError || !reachedEnd ? 'error' : 'success',
          durationMs,
          nodeResults,
          logs,
        },
      };
    },
  },
];

export function registerTools(server: McpServer, ctx: McpContext): void {
  for (const def of toolDefinitions) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      async (args: any) => {
        try {
          const result = await def.handler(args, ctx);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: result.isError };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `Error: ${err?.message || String(err)}` }], isError: true };
        }
      },
    );
  }
}
