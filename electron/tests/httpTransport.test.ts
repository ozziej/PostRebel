import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { executeHttpConfig } from '../httpTransport';

describe('executeHttpConfig', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hello: 'world' }));
      } else if (req.url === '/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'boom' }));
      } else if (req.url === '/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('plain body');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  it('parses a JSON response body and reports success', async () => {
    const result = await executeHttpConfig({ method: 'get', url: `${baseUrl}/json` });
    expect(result.success).toBe(true);
    expect(result.response?.status).toBe(200);
    expect(result.response?.data).toEqual({ hello: 'world' });
  });

  it('keeps a plain-text body as a string', async () => {
    const result = await executeHttpConfig({ method: 'get', url: `${baseUrl}/text` });
    expect(result.response?.data).toBe('plain body');
  });

  it('treats a non-2xx status as a successful transport call carrying an error response', async () => {
    const result = await executeHttpConfig({ method: 'get', url: `${baseUrl}/error` });
    expect(result.success).toBe(true);
    expect(result.response?.status).toBe(500);
    expect(result.response?.data).toEqual({ message: 'boom' });
  });

  it('reports a network error (connection refused) as a transport failure', async () => {
    const result = await executeHttpConfig({ method: 'get', url: 'http://127.0.0.1:1', timeout: 1000 });
    expect(result.success).toBe(false);
    expect(result.error?.message).toBeDefined();
  });
});
