"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // Workspace management
    createWorkspace: (name, description) => electron_1.ipcRenderer.invoke('create-workspace', name, description),
    loadWorkspaces: () => electron_1.ipcRenderer.invoke('load-workspaces'),
    setActiveWorkspace: (workspaceId) => electron_1.ipcRenderer.invoke('set-active-workspace', workspaceId),
    updateWorkspace: (workspaceId, name, description) => electron_1.ipcRenderer.invoke('update-workspace', workspaceId, name, description),
    deleteWorkspace: (workspaceId) => electron_1.ipcRenderer.invoke('delete-workspace', workspaceId),
    // Collection management
    saveCollection: (workspaceId, data) => electron_1.ipcRenderer.invoke('save-collection', workspaceId, data),
    loadCollections: (workspaceId) => electron_1.ipcRenderer.invoke('load-collections', workspaceId),
    deleteCollection: (workspaceId, collectionName) => electron_1.ipcRenderer.invoke('delete-collection', workspaceId, collectionName),
    // Environment management
    saveEnvironment: (workspaceId, data) => electron_1.ipcRenderer.invoke('save-environment', workspaceId, data),
    loadEnvironments: (workspaceId) => electron_1.ipcRenderer.invoke('load-environments', workspaceId),
    // Certificate management
    saveCertificate: (data) => electron_1.ipcRenderer.invoke('save-certificate', data),
    loadCertificates: () => electron_1.ipcRenderer.invoke('load-certificates'),
    deleteCertificate: (id) => electron_1.ipcRenderer.invoke('delete-certificate', id),
    loadCertificateFile: () => electron_1.ipcRenderer.invoke('load-certificate-file'),
    // HTTP execution
    executeHttpRequest: (requestConfig) => electron_1.ipcRenderer.invoke('execute-http-request', requestConfig),
    // Git operations
    gitInit: () => electron_1.ipcRenderer.invoke('git-init'),
    gitStatus: () => electron_1.ipcRenderer.invoke('git-status'),
    // Settings
    getSettings: () => electron_1.ipcRenderer.invoke('get-settings'),
    updateSettings: (settings) => electron_1.ipcRenderer.invoke('update-settings', settings),
    savePreference: (key, value) => electron_1.ipcRenderer.invoke('save-preference', key, value),
    chooseWorkspaceDirectory: () => electron_1.ipcRenderer.invoke('choose-workspace-directory'),
    // Import
    selectJsonFile: () => electron_1.ipcRenderer.invoke('select-json-file'),
    selectBinaryFile: () => electron_1.ipcRenderer.invoke('select-binary-file'),
    // History
    loadHistory: (workspaceId) => electron_1.ipcRenderer.invoke('load-history', workspaceId),
    saveHistoryEntry: (workspaceId, entry) => electron_1.ipcRenderer.invoke('save-history-entry', workspaceId, entry),
    truncateHistory: (workspaceId, maxPerRequest) => electron_1.ipcRenderer.invoke('truncate-history', workspaceId, maxPerRequest),
    // Saved Responses
    loadSavedResponses: (workspaceId) => electron_1.ipcRenderer.invoke('load-saved-responses', workspaceId),
    saveSavedResponse: (workspaceId, entry) => electron_1.ipcRenderer.invoke('save-saved-response', workspaceId, entry),
    deleteSavedResponse: (workspaceId, entryId) => electron_1.ipcRenderer.invoke('delete-saved-response', workspaceId, entryId),
    renameSavedResponse: (workspaceId, entryId, newName) => electron_1.ipcRenderer.invoke('rename-saved-response', workspaceId, entryId, newName),
    // Runner management
    loadRunners: (workspaceId) => electron_1.ipcRenderer.invoke('load-runners', workspaceId),
    saveRunner: (workspaceId, runner) => electron_1.ipcRenderer.invoke('save-runner', workspaceId, runner),
    deleteRunner: (workspaceId, runnerId) => electron_1.ipcRenderer.invoke('delete-runner', workspaceId, runnerId),
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', api);
