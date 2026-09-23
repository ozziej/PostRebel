import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'postrebel-smoke-'));
const wsPath = path.join(tmp, 'ws', 'TestWorkspace');
await fs.mkdir(path.join(wsPath, 'collections'), { recursive: true });
await fs.mkdir(path.join(wsPath, 'environments'), { recursive: true });
await fs.mkdir(path.join(wsPath, 'runners'), { recursive: true });

await fs.writeFile(path.join(wsPath, 'collections', 'Demo.json'), JSON.stringify({
  id: 'c1', name: 'Demo', requests: [{ id: 'r1', name: 'Ping', method: 'GET', url: '{{baseUrl}}/', headers: {} }],
}));
await fs.writeFile(path.join(wsPath, 'environments', 'Local.json'), JSON.stringify({
  id: 'e1', name: 'Local', variables: { baseUrl: `http://127.0.0.1:${port}` },
}));
await fs.writeFile(path.join(wsPath, 'runners', 'r1.json'), JSON.stringify({
  id: 'run1', name: 'Smoke', collectionId: 'c1', workspaceId: 'TestWorkspace', createdAt: '', updatedAt: '',
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
    { id: 'req1', type: 'request', position: { x: 0, y: 0 }, data: { label: 'Ping', requestId: 'r1' } },
    { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'req1' },
    { id: 'e2', source: 'req1', target: 'end' },
  ],
}));

const cliPath = path.join(process.cwd(), 'dist', 'electron', 'cli.js');
execFile('node', [cliPath, 'run', 'Demo', '--workspace', 'TestWorkspace', '--env', 'Local', '--reporter', 'json', '--workspaces-dir', path.join(tmp, 'ws'), '--user-data-dir', path.join(tmp, 'userdata')], async (err, stdout, stderr) => {
  console.log('STDOUT:\n' + stdout);
  console.log('STDERR:\n' + stderr);
  console.log('EXIT CODE:', err ? err.code : 0);
  try {
    JSON.parse(stdout);
    console.log('STDOUT IS VALID JSON: yes');
  } catch (e) {
    console.log('STDOUT IS VALID JSON: no —', e.message);
  }
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});
