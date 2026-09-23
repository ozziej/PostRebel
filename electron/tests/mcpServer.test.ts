import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { toolDefinitions, McpContext } from '../mcpTools';

function tool(name: string) {
  const def = toolDefinitions.find(t => t.name === name);
  if (!def) throw new Error(`Tool "${name}" not registered`);
  return def;
}

async function call(name: string, args: any, ctx: McpContext) {
  return tool(name).handler(args, ctx);
}

describe('MCP tools end-to-end against a local HTTP server', () => {
  let server: http.Server;
  let ctx: McpContext;
  let tmpRoot: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hello: 'world' }));
      } else if (req.url === '/fail') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'postrebel-mcp-test-'));
    const workspacesDir = path.join(tmpRoot, 'workspaces');
    const userDataDir = path.join(tmpRoot, 'userdata');
    ctx = { workspacesDir, userDataDir };

    const wsPath = path.join(workspacesDir, 'TestWorkspace');
    await fs.mkdir(path.join(wsPath, 'collections'), { recursive: true });
    await fs.mkdir(path.join(wsPath, 'environments'), { recursive: true });
    await fs.mkdir(path.join(wsPath, 'runners'), { recursive: true });
    await fs.writeFile(path.join(wsPath, 'workspace.json'), JSON.stringify({ name: 'Test Workspace', description: '', createdAt: '', updatedAt: '' }));

    const collection = {
      id: 'c1',
      name: 'Demo',
      requests: [
        { id: 'r-ok', name: 'Get OK', method: 'GET', url: '{{baseUrl}}/ok', headers: {}, auth: { type: 'bearer', bearer: 'super-secret-token' } },
        { id: 'r-fail', name: 'Get Fail', method: 'GET', url: '{{baseUrl}}/fail', headers: {} },
      ],
      folders: [
        { id: 'f1', name: 'nested', requests: [{ id: 'r-nested', name: 'Nested Request', method: 'GET', url: '{{baseUrl}}/ok', headers: {} }] },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'collections', 'Demo.json'), JSON.stringify(collection, null, 2));

    const environment = {
      id: 'e1', name: 'Local',
      variables: { baseUrl: `http://127.0.0.1:${port}` },
      variablesArray: [
        { key: 'baseUrl', value: `http://127.0.0.1:${port}`, isSecret: false },
        { key: 'apiKey', value: 'shh-do-not-leak', isSecret: true },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'environments', 'Local.json'), JSON.stringify(environment, null, 2));

    const baseRunner = { workspaceId: 'TestWorkspace', collectionId: 'c1', createdAt: '', updatedAt: '' };
    const passingRunner = {
      ...baseRunner,
      id: 'run-pass', name: 'Smoke',
      edges: [{ id: 'e1', source: 'start', target: 'req1' }, { id: 'e2', source: 'req1', target: 'end' }],
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Get OK', requestId: 'r-ok' } },
        { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'runners', 'run-pass.json'), JSON.stringify(passingRunner, null, 2));

    const failingRunner = {
      ...baseRunner,
      id: 'run-fail', name: 'Broken',
      edges: [{ id: 'e1', source: 'start', target: 'req1' }, { id: 'e2', source: 'req1', target: 'end' }],
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Get Fail', requestId: 'r-fail' } },
        { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'runners', 'run-fail.json'), JSON.stringify(failingRunner, null, 2));
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('list_workspaces sees the fixture workspace by its folder name', async () => {
    const result = await call('list_workspaces', {}, ctx);
    expect(result.data).toEqual({ workspaces: [{ workspace: 'TestWorkspace', name: 'Test Workspace', path: path.join(ctx.workspacesDir, 'TestWorkspace') }] });
  });

  it('list_collections returns the fixture collection with counts', async () => {
    const result = await call('list_collections', { workspace: 'TestWorkspace' }, ctx);
    expect(result.data).toEqual({ collections: [{ id: 'c1', name: 'Demo', requestCount: 3, folderNames: ['nested'] }] });
  });

  it('list_requests returns every request including nested ones, with folder breadcrumbs', async () => {
    const result: any = await call('list_requests', { workspace: 'TestWorkspace', collection: 'Demo' }, ctx);
    expect(result.data.requests).toEqual(expect.arrayContaining([
      { id: 'r-ok', name: 'Get OK', method: 'GET', url: '{{baseUrl}}/ok', folderPath: [] },
      { id: 'r-fail', name: 'Get Fail', method: 'GET', url: '{{baseUrl}}/fail', folderPath: [] },
      { id: 'r-nested', name: 'Nested Request', method: 'GET', url: '{{baseUrl}}/ok', folderPath: ['nested'] },
    ]));
    expect(result.data.requests).toHaveLength(3);
  });

  it('list_requests resolves the collection by name case-insensitively', async () => {
    const result: any = await call('list_requests', { workspace: 'TestWorkspace', collection: 'demo' }, ctx);
    expect(result.data.collection).toEqual({ id: 'c1', name: 'Demo' });
  });

  it('list_requests reports a clear error for an unknown collection', async () => {
    const result: any = await call('list_requests', { workspace: 'TestWorkspace', collection: 'Nonexistent' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.data.error).toContain('Nonexistent');
    expect(result.data.error).toContain('Demo');
  });

  it('get_request redacts a bearer token', async () => {
    const result: any = await call('get_request', { workspace: 'TestWorkspace', collection: 'Demo', request: 'Get OK' }, ctx);
    expect(result.data.auth).toEqual({ type: 'bearer', bearer: '<redacted>' });
  });

  it('get_request resolves the request by id too', async () => {
    const result: any = await call('get_request', { workspace: 'TestWorkspace', collection: 'c1', request: 'r-ok' }, ctx);
    expect(result.data.name).toBe('Get OK');
  });

  it('list_environments omits secret variable values but not non-secret ones', async () => {
    const result: any = await call('list_environments', { workspace: 'TestWorkspace' }, ctx);
    expect(result.data.environments[0].variables).toEqual(expect.arrayContaining([
      { key: 'baseUrl', isSecret: false, value: expect.stringContaining('http://127.0.0.1') },
      { key: 'apiKey', isSecret: true, value: undefined },
    ]));
  });

  it('list_runners filters by collection', async () => {
    const result: any = await call('list_runners', { workspace: 'TestWorkspace', collection: 'Demo' }, ctx);
    expect(result.data.runners.map((r: any) => r.name).sort()).toEqual(['Broken', 'Smoke']);
  });

  it('run_request executes a real HTTP call and returns the response', async () => {
    const result: any = await call('run_request', { workspace: 'TestWorkspace', collection: 'Demo', request: 'Get OK', environment: 'Local' }, ctx);
    expect(result.data.status).toBe(200);
    expect(result.data.body).toEqual({ hello: 'world' });
    expect(result.data.resolved.url).toContain('/ok');
  });

  it('run_request reports a clear error for an unknown request', async () => {
    const result: any = await call('run_request', { workspace: 'TestWorkspace', collection: 'Demo', request: 'Nope', environment: 'Local' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.data.error).toContain('Nope');
  });

  it('run_request reports a clear error for an unknown environment', async () => {
    const result: any = await call('run_request', { workspace: 'TestWorkspace', collection: 'Demo', request: 'Get OK', environment: 'Missing' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.data.error).toContain('Missing');
  });

  it('run_runner runs the passing runner end to end', async () => {
    const result: any = await call('run_runner', { workspace: 'TestWorkspace', collection: 'Demo', runner: 'Smoke', environment: 'Local' }, ctx);
    expect(result.data.status).toBe('success');
    expect(result.data.nodeResults.req1.status).toBe('success');
    expect(result.data.nodeResults.req1.response.status).toBe(200);
  });

  it('run_runner reflects a failing node', async () => {
    const result: any = await call('run_runner', { workspace: 'TestWorkspace', collection: 'Demo', runner: 'Broken', environment: 'Local' }, ctx);
    expect(result.data.status).toBe('error');
    expect(result.data.nodeResults.req1.response.status).toBe(500);
  });

  it('run_runner reports a clear error for an unknown runner', async () => {
    const result: any = await call('run_runner', { workspace: 'TestWorkspace', collection: 'Demo', runner: 'Nope', environment: 'Local' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.data.error).toContain('Nope');
  });
});
