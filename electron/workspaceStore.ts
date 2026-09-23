import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Collection, Environment, Certificate, Runner, Workspace } from '../src/types';
import { flattenRequests } from '../src/utils/collectionTree';

// Read-only mirror of the workspace file layout electron/main.ts's IPC handlers
// read/write, used by the headless CLI runner (which has no Electron process
// to talk to over IPC).

export function getDefaultUserDataDir(appName = 'postrebel'): string {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
}

export async function loadSettings(userDataDir: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(path.join(userDataDir, 'settings.json'), 'utf-8'));
  } catch {
    return {};
  }
}

export async function resolveWorkspacesDir(userDataDir: string, override?: string): Promise<string> {
  if (override) return override;
  if (process.env.POSTREBEL_WORKSPACES_DIR) return process.env.POSTREBEL_WORKSPACES_DIR;
  const settings = await loadSettings(userDataDir);
  if (settings.workspacesDirectory) return settings.workspacesDirectory;
  return path.join(os.homedir(), 'PostRebelWorkspaces');
}

// Mirrors main.ts's 'load-workspaces' IPC handler — enumerates every workspace
// folder under `workspacesDir`, unlike the CLI (which is always told a single
// workspace name via --workspace) this is needed by the MCP server's
// list_workspaces tool, which has no equivalent single-workspace flag.
export async function listWorkspaces(workspacesDir: string): Promise<Workspace[]> {
  let entryNames: string[];
  try {
    entryNames = (await fs.readdir(workspacesDir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }

  const workspaces: Workspace[] = [];
  for (const name of entryNames) {
    try {
      const content = await fs.readFile(path.join(workspacesDir, name, 'workspace.json'), 'utf-8');
      const workspace = JSON.parse(content);
      // IMPORTANT: use the folder name as the true id, not what's in the file — fixes manually renamed folders.
      workspace.id = name;
      workspace.path = path.join(workspacesDir, name);
      workspaces.push(workspace);
    } catch {
      // Skip directories without a valid workspace.json
    }
  }
  return workspaces;
}

async function readJsonFilesInDir(dir: string, filter: (file: string) => boolean): Promise<Array<{ file: string; data: any }>> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: Array<{ file: string; data: any }> = [];
  for (const file of files.filter(filter)) {
    try {
      out.push({ file, data: JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')) });
    } catch {
      // skip corrupt file
    }
  }
  return out;
}

export async function loadCollections(workspacePath: string): Promise<Collection[]> {
  const dir = path.join(workspacePath, 'collections');
  const entries = await readJsonFilesInDir(dir, f => f.endsWith('.json') && !f.endsWith('.secrets.json'));
  const collections: Collection[] = [];

  for (const { file, data: collection } of entries) {
    const secretsFile = file.replace(/\.json$/, '.secrets.json');
    try {
      const secrets = JSON.parse(await fs.readFile(path.join(dir, secretsFile), 'utf-8'));

      if (secrets.requests) {
        for (const req of flattenRequests(collection)) {
          if (secrets.requests[req.id]?.formData && req.body?.formData) {
            req.body.formData = req.body.formData.map((param: any) =>
              param.isSecret && secrets.requests[req.id].formData[param.key]
                ? { ...param, value: secrets.requests[req.id].formData[param.key] }
                : param
            );
          }
        }
      }

      if (secrets.variables && collection.variablesArray) {
        collection.variablesArray = collection.variablesArray.map((v: any) =>
          v.isSecret && secrets.variables[v.key] ? { ...v, value: secrets.variables[v.key] } : v
        );
      }
    } catch {
      // no secrets file
    }

    if (collection.variablesArray) {
      collection.variables = {};
      collection.variablesArray.forEach((v: any) => { collection.variables![v.key] = v.value; });
    }

    collections.push(collection);
  }

  return collections;
}

export async function loadEnvironments(workspacePath: string): Promise<Environment[]> {
  const dir = path.join(workspacePath, 'environments');
  const entries = await readJsonFilesInDir(dir, f => f.endsWith('.json') && !f.includes('.local.') && !f.endsWith('.secrets.json'));
  const environments: Environment[] = [];

  for (const { file, data: environment } of entries) {
    const secretsFile = file.replace(/\.json$/, '.secrets.json');
    try {
      const secrets = JSON.parse(await fs.readFile(path.join(dir, secretsFile), 'utf-8'));
      if (secrets.variables && environment.variablesArray) {
        environment.variablesArray = environment.variablesArray.map((v: any) =>
          v.isSecret && secrets.variables[v.key] ? { ...v, value: secrets.variables[v.key] } : v
        );
      }
    } catch {
      // no secrets file
    }

    if (environment.variablesArray) {
      environment.variables = {};
      environment.variablesArray.forEach((v: any) => { environment.variables[v.key] = v.value; });
    }

    environments.push(environment);
  }

  return environments;
}

export async function loadRunners(workspacePath: string): Promise<Runner[]> {
  const entries = await readJsonFilesInDir(path.join(workspacePath, 'runners'), f => f.endsWith('.json'));
  return entries.map(e => e.data);
}

export async function loadCertificates(userDataDir: string): Promise<Certificate[]> {
  const entries = await readJsonFilesInDir(path.join(userDataDir, 'certificates'), f => f.endsWith('.json'));
  return entries.map(e => e.data);
}
