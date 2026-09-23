import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  getDefaultUserDataDir, resolveWorkspacesDir,
  loadCollections, loadEnvironments, loadRunners, loadCertificates,
} from '../workspaceStore';

describe('getDefaultUserDataDir', () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses Application Support on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getDefaultUserDataDir('postrebel')).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'postrebel'));
  });

  it('uses %APPDATA% on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const prevAppData = process.env.APPDATA;
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    expect(getDefaultUserDataDir('postrebel')).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'postrebel'));
    process.env.APPDATA = prevAppData;
  });

  it('uses ~/.config on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const prevXdg = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    expect(getDefaultUserDataDir('postrebel')).toBe(path.join(os.homedir(), '.config', 'postrebel'));
    process.env.XDG_CONFIG_HOME = prevXdg;
  });
});

describe('resolveWorkspacesDir', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'postrebel-store-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    delete process.env.POSTREBEL_WORKSPACES_DIR;
  });

  it('prefers an explicit override over everything else', async () => {
    const dir = await resolveWorkspacesDir(tmp, '/explicit/override');
    expect(dir).toBe('/explicit/override');
  });

  it('falls back to $POSTREBEL_WORKSPACES_DIR when no override is given', async () => {
    process.env.POSTREBEL_WORKSPACES_DIR = '/from/env';
    expect(await resolveWorkspacesDir(tmp)).toBe('/from/env');
  });

  it('reads workspacesDirectory from settings.json when set', async () => {
    await fs.writeFile(path.join(tmp, 'settings.json'), JSON.stringify({ workspacesDirectory: '/from/settings' }));
    expect(await resolveWorkspacesDir(tmp)).toBe('/from/settings');
  });

  it('defaults to ~/PostRebelWorkspaces when nothing else is configured', async () => {
    expect(await resolveWorkspacesDir(tmp)).toBe(path.join(os.homedir(), 'PostRebelWorkspaces'));
  });
});

describe('loadCollections / loadEnvironments / loadRunners / loadCertificates', () => {
  let workspacePath: string;
  let userDataDir: string;

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'postrebel-store-data-'));
    workspacePath = path.join(tmp, 'ws');
    userDataDir = path.join(tmp, 'userdata');
    await fs.mkdir(path.join(workspacePath, 'collections'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'environments'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'runners'), { recursive: true });
    await fs.mkdir(path.join(userDataDir, 'certificates'), { recursive: true });
  });

  it('returns an empty array when a directory does not exist', async () => {
    expect(await loadCollections('/does/not/exist')).toEqual([]);
    expect(await loadEnvironments('/does/not/exist')).toEqual([]);
    expect(await loadRunners('/does/not/exist')).toEqual([]);
    expect(await loadCertificates('/does/not/exist')).toEqual([]);
  });

  it('merges secret formData values into requests nested inside folders at any depth', async () => {
    const collection = {
      id: 'c1',
      name: 'Demo',
      requests: [],
      folders: [{
        id: 'fA',
        name: 'A',
        requests: [],
        folders: [{
          id: 'fB',
          name: 'B',
          requests: [{
            id: 'r1',
            name: 'Login',
            method: 'POST',
            url: 'https://example.com',
            headers: {},
            body: { type: 'x-www-form-urlencoded', data: '', formData: [{ key: 'password', value: '', isSecret: true, enabled: true }] },
          }],
        }],
      }],
    };
    await fs.writeFile(path.join(workspacePath, 'collections', 'Demo.json'), JSON.stringify(collection));
    await fs.writeFile(
      path.join(workspacePath, 'collections', 'Demo.secrets.json'),
      JSON.stringify({ requests: { r1: { formData: { password: 'hunter2' } } } }),
    );

    const [loaded] = await loadCollections(workspacePath);
    const nested = loaded.folders![0].folders![0].requests[0];
    expect(nested.body!.formData![0].value).toBe('hunter2');
  });

  it('syncs variablesArray into the legacy flat variables map for collections and environments', async () => {
    const collection = { id: 'c1', name: 'Demo', requests: [], variablesArray: [{ key: 'x', value: '1', isSecret: false }] };
    await fs.writeFile(path.join(workspacePath, 'collections', 'Demo.json'), JSON.stringify(collection));
    const environment = { id: 'e1', name: 'Dev', variables: {}, variablesArray: [{ key: 'y', value: '2', isSecret: false }] };
    await fs.writeFile(path.join(workspacePath, 'environments', 'Dev.json'), JSON.stringify(environment));

    const [loadedCollection] = await loadCollections(workspacePath);
    expect(loadedCollection.variables).toEqual({ x: '1' });
    const [loadedEnv] = await loadEnvironments(workspacePath);
    expect(loadedEnv.variables).toEqual({ y: '2' });
  });

  it('skips .secrets.json and .local. environment files as standalone entries', async () => {
    await fs.writeFile(path.join(workspacePath, 'environments', 'Dev.json'), JSON.stringify({ id: 'e1', name: 'Dev', variables: {} }));
    await fs.writeFile(path.join(workspacePath, 'environments', 'Dev.secrets.json'), JSON.stringify({ variables: {} }));
    await fs.writeFile(path.join(workspacePath, 'environments', 'Dev.local.json'), JSON.stringify({ id: 'e2', name: 'DevLocal', variables: {} }));

    const environments = await loadEnvironments(workspacePath);
    expect(environments.map(e => e.name)).toEqual(['Dev']);
  });

  it('loads runners and certificates as plain JSON arrays', async () => {
    await fs.writeFile(path.join(workspacePath, 'runners', 'r1.json'), JSON.stringify({ id: 'r1', name: 'Smoke', collectionId: 'c1' }));
    await fs.writeFile(path.join(userDataDir, 'certificates', 'cert1.json'), JSON.stringify({ id: 'cert1', name: 'Internal CA', host: '*', pemData: '', type: 'ca' }));

    const runners = await loadRunners(workspacePath);
    expect(runners).toEqual([{ id: 'r1', name: 'Smoke', collectionId: 'c1' }]);
    const certs = await loadCertificates(userDataDir);
    expect(certs.map(c => c.name)).toEqual(['Internal CA']);
  });
});
