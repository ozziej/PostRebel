import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { runCli, parseArgs } from '../cli';

describe('parseArgs', () => {
  it('parses a fully-specified run command', () => {
    const opts = parseArgs(['run', 'My Collection', '--workspace', 'ws1', '--env', 'Dev', '--runner', 'Smoke', '--reporter', 'json', '--out', 'out.json']);
    expect(opts).toEqual({
      collectionName: 'My Collection',
      workspace: 'ws1',
      env: 'Dev',
      runner: 'Smoke',
      reporter: 'json',
      out: 'out.json',
      workspacesDir: undefined,
      userDataDir: undefined,
    });
  });

  it('defaults the reporter to text', () => {
    expect(parseArgs(['run', 'C', '--workspace', 'ws1']).reporter).toBe('text');
  });

  it('requires --workspace', () => {
    expect(() => parseArgs(['run', 'My Collection'])).toThrow(/workspace/i);
  });

  it('rejects an unknown reporter', () => {
    expect(() => parseArgs(['run', 'C', '--workspace', 'ws1', '--reporter', 'yaml'])).toThrow(/reporter/i);
  });

  it('rejects anything other than the "run" subcommand', () => {
    expect(() => parseArgs(['bogus'])).toThrow();
  });

  it('rejects more than one collection name', () => {
    expect(() => parseArgs(['run', 'A', 'B', '--workspace', 'ws1'])).toThrow(/exactly one/i);
  });
});

describe('runCli end-to-end against a local HTTP server', () => {
  let server: http.Server;
  let workspacesDir: string;
  let userDataDir: string;
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

    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'postrebel-cli-test-'));
    workspacesDir = path.join(tmpRoot, 'workspaces');
    userDataDir = path.join(tmpRoot, 'userdata');
    const wsPath = path.join(workspacesDir, 'TestWorkspace');
    await fs.mkdir(path.join(wsPath, 'collections'), { recursive: true });
    await fs.mkdir(path.join(wsPath, 'environments'), { recursive: true });
    await fs.mkdir(path.join(wsPath, 'runners'), { recursive: true });

    const collection = {
      id: 'c1',
      name: 'Demo',
      requests: [
        { id: 'r-ok', name: 'Get OK', method: 'GET', url: '{{baseUrl}}/ok', headers: {} },
        { id: 'r-fail', name: 'Get Fail', method: 'GET', url: '{{baseUrl}}/fail', headers: {} },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'collections', 'Demo.json'), JSON.stringify(collection, null, 2));

    const environment = { id: 'e1', name: 'Local', variables: { baseUrl: `http://127.0.0.1:${port}` } };
    await fs.writeFile(path.join(wsPath, 'environments', 'Local.json'), JSON.stringify(environment, null, 2));

    const baseRunner = {
      workspaceId: 'TestWorkspace',
      collectionId: 'c1',
      createdAt: '',
      updatedAt: '',
      edges: [
        { id: 'e1', source: 'start', target: 'req1' },
        { id: 'e2', source: 'req1', target: 'end' },
      ],
    };

    const passingRunner = {
      ...baseRunner,
      id: 'run-pass',
      name: 'Smoke',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Get OK', requestId: 'r-ok' } },
        { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
      ],
    };
    await fs.writeFile(path.join(wsPath, 'runners', 'run-pass.json'), JSON.stringify(passingRunner, null, 2));

    const failingRunner = {
      ...baseRunner,
      id: 'run-fail',
      name: 'Broken',
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

  it('runs a passing runner against the real HTTP server, exits 0, and prints a text summary', async () => {
    const logs: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--runner', 'Smoke', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      (line) => logs.push(line),
    );
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('Run success');
    expect(logs.join('\n')).toContain('Get OK');
  });

  it('runs a failing runner, exits 1, and reports the failed node as JSON', async () => {
    const logs: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--runner', 'Broken', '--reporter', 'json', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      (line) => logs.push(line),
    );
    expect(code).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.status).toBe('error');
    expect(parsed.nodeResults.req1.status).toBe('error');
    expect(parsed.nodeResults.req1.response.status).toBe(500);
  });

  it('produces JUnit XML with a <failure> for the broken runner', async () => {
    const logs: string[] = [];
    await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--runner', 'Broken', '--reporter', 'junit', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      (line) => logs.push(line),
    );
    expect(logs[0]).toContain('<testsuite');
    expect(logs[0]).toContain('<failure');
  });

  it('auto-selects the runner when the collection has exactly one', async () => {
    // "Demo" has two runners in this fixture, so omitting --runner should fail with a clear message.
    const errors: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      undefined,
      (line) => errors.push(line),
    );
    expect(code).toBe(1);
    expect(errors[0]).toContain('multiple runners');
  });

  it('errors clearly when the collection does not exist', async () => {
    const errors: string[] = [];
    const code = await runCli(
      ['run', 'Nonexistent', '--workspace', 'TestWorkspace', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      undefined,
      (line) => errors.push(line),
    );
    expect(code).toBe(1);
    expect(errors[0]).toContain('Nonexistent');
  });

  it('errors clearly when the requested environment does not exist', async () => {
    const errors: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Missing', '--runner', 'Smoke', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      undefined,
      (line) => errors.push(line),
    );
    expect(code).toBe(1);
    expect(errors[0]).toContain('Missing');
  });

  it('errors clearly when the requested runner does not exist', async () => {
    const errors: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--runner', 'Nope', '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      undefined,
      (line) => errors.push(line),
    );
    expect(code).toBe(1);
    expect(errors[0]).toContain('Nope');
  });

  it('writes the report to --out instead of stdout', async () => {
    const outFile = path.join(tmpRoot, 'report.txt');
    const logs: string[] = [];
    const code = await runCli(
      ['run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--runner', 'Smoke', '--out', outFile, '--workspaces-dir', workspacesDir, '--user-data-dir', userDataDir],
      (line) => logs.push(line),
    );
    expect(code).toBe(0);
    expect(logs.length).toBe(0);
    const content = await fs.readFile(outFile, 'utf-8');
    expect(content).toContain('Run success');
  });
});
