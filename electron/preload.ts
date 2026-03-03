import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Workspace management
  createWorkspace: (name: string, description?: string) => Promise<any>;
  loadWorkspaces: () => Promise<any>;
  setActiveWorkspace: (workspaceId: string) => Promise<any>;

  // Collection management
  saveCollection: (workspaceId: string | undefined, data: any) => Promise<any>;
  loadCollections: (workspaceId?: string) => Promise<any>;

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
}

const api: ElectronAPI = {
  // Workspace management
  createWorkspace: (name, description) => ipcRenderer.invoke('create-workspace', name, description),
  loadWorkspaces: () => ipcRenderer.invoke('load-workspaces'),
  setActiveWorkspace: (workspaceId) => ipcRenderer.invoke('set-active-workspace', workspaceId),

  // Collection management
  saveCollection: (workspaceId, data) => ipcRenderer.invoke('save-collection', workspaceId, data),
  loadCollections: (workspaceId) => ipcRenderer.invoke('load-collections', workspaceId),

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
};

contextBridge.exposeInMainWorld('electronAPI', api);