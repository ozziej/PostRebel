import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Workspace management
  createWorkspace: (name: string, description?: string) => Promise<any>;
  loadWorkspaces: () => Promise<any>;
  setActiveWorkspace: (workspaceId: string) => Promise<any>;
  updateWorkspace: (workspaceId: string, name: string, description?: string) => Promise<any>;
  deleteWorkspace: (workspaceId: string) => Promise<any>;

  // Collection management
  saveCollection: (workspaceId: string | undefined, data: any) => Promise<any>;
  loadCollections: (workspaceId?: string) => Promise<any>;
  deleteCollection: (workspaceId: string | undefined, collectionName: string) => Promise<any>;

  // Environment management
  saveEnvironment: (workspaceId: string | undefined, data: any) => Promise<any>;
  loadEnvironments: (workspaceId?: string) => Promise<any>;

  // Certificate management
  saveCertificate: (data: any) => Promise<any>;
  loadCertificates: () => Promise<any>;
  deleteCertificate: (id: string) => Promise<any>;
  loadCertificateFile: () => Promise<any>;

  // HTTP execution
  executeHttpRequest: (requestConfig: any) => Promise<any>;

  // Git operations
  gitInit: () => Promise<any>;
  gitStatus: () => Promise<any>;

  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;
  savePreference: (key: string, value: any) => Promise<any>;
  chooseWorkspaceDirectory: () => Promise<any>;

  // Import
  selectJsonFile: () => Promise<{ success: boolean; content?: string; error?: string }>;

  // History
  loadHistory: (workspaceId: string) => Promise<any>;
  saveHistoryEntry: (workspaceId: string, entry: any) => Promise<any>;
  truncateHistory: (workspaceId: string, maxPerRequest: number) => Promise<any>;
}

const api: ElectronAPI = {
  // Workspace management
  createWorkspace: (name, description) => ipcRenderer.invoke('create-workspace', name, description),
  loadWorkspaces: () => ipcRenderer.invoke('load-workspaces'),
  setActiveWorkspace: (workspaceId) => ipcRenderer.invoke('set-active-workspace', workspaceId),
  updateWorkspace: (workspaceId, name, description) => ipcRenderer.invoke('update-workspace', workspaceId, name, description),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke('delete-workspace', workspaceId),

  // Collection management
  saveCollection: (workspaceId, data) => ipcRenderer.invoke('save-collection', workspaceId, data),
  loadCollections: (workspaceId) => ipcRenderer.invoke('load-collections', workspaceId),
  deleteCollection: (workspaceId, collectionName) => ipcRenderer.invoke('delete-collection', workspaceId, collectionName),

  // Environment management
  saveEnvironment: (workspaceId, data) => ipcRenderer.invoke('save-environment', workspaceId, data),
  loadEnvironments: (workspaceId) => ipcRenderer.invoke('load-environments', workspaceId),

  // Certificate management
  saveCertificate: (data) => ipcRenderer.invoke('save-certificate', data),
  loadCertificates: () => ipcRenderer.invoke('load-certificates'),
  deleteCertificate: (id) => ipcRenderer.invoke('delete-certificate', id),
  loadCertificateFile: () => ipcRenderer.invoke('load-certificate-file'),

  // HTTP execution
  executeHttpRequest: (requestConfig) => ipcRenderer.invoke('execute-http-request', requestConfig),

  // Git operations
  gitInit: () => ipcRenderer.invoke('git-init'),
  gitStatus: () => ipcRenderer.invoke('git-status'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  savePreference: (key, value) => ipcRenderer.invoke('save-preference', key, value),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke('choose-workspace-directory'),

  // Import
  selectJsonFile: () => ipcRenderer.invoke('select-json-file'),

  // History
  loadHistory: (workspaceId) => ipcRenderer.invoke('load-history', workspaceId),
  saveHistoryEntry: (workspaceId, entry) => ipcRenderer.invoke('save-history-entry', workspaceId, entry),
  truncateHistory: (workspaceId, maxPerRequest) => ipcRenderer.invoke('truncate-history', workspaceId, maxPerRequest),
};

contextBridge.exposeInMainWorld('electronAPI', api);