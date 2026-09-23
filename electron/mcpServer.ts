#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDefaultUserDataDir, resolveWorkspacesDir } from './workspaceStore';
import { registerTools } from './mcpTools';

// Read directly from package.json rather than `import ... from '../package.json'`:
// after compilation this file lives at dist/electron/mcpServer.js, and a JSON
// import's relative specifier isn't rewritten by tsc, so it would resolve to
// dist/package.json (which doesn't exist) instead of the real repo-root file.
function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8');
    return JSON.parse(raw).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// `postrebel mcp` — a stdio MCP server exposing workspaces/collections/requests/
// runners to an AI agent, reusing the same headless engine as the CLI runner.
// No listening port, no hosted process: the MCP client (Claude Code/Desktop)
// spawns this as a subprocess for the session and talks JSON-RPC over stdio.

interface McpServerOptions {
  workspacesDir?: string;
  userDataDir?: string;
}

// Same flag names as `postrebel run`, parsed the same simple way.
export function parseMcpArgs(argv: string[]): McpServerOptions {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      opts[arg.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return { workspacesDir: opts['workspaces-dir'], userDataDir: opts['user-data-dir'] };
}

export async function runMcpServer(argv: string[]): Promise<void> {
  const opts = parseMcpArgs(argv);
  const userDataDir = opts.userDataDir || getDefaultUserDataDir();
  const workspacesDir = await resolveWorkspacesDir(userDataDir, opts.workspacesDir);

  const server = new McpServer({ name: 'postrebel', version: readPackageVersion() });
  registerTools(server, { workspacesDir, userDataDir });

  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runMcpServer(process.argv.slice(2)).catch((err) => {
    console.error('[postrebel mcp] fatal error:', err);
    process.exit(1);
  });
}
