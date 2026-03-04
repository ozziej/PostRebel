export interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
  isSecret?: boolean;
}

export interface ApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers: Record<string, string>;
  body?: {
    type: 'raw' | 'form-data' | 'x-www-form-urlencoded';
    data: string | FormData | Record<string, string>;
    formData?: Array<KeyValuePair>;
  };
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'jwt';
    bearer?: string;
    basic?: { username: string; password: string };
    jwt?: string;
  };
  preRequestScript?: string;
  testScript?: string;
}

export interface Collection {
  id: string;
  name: string;
  requests: ApiRequest[];
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>; // Legacy support
  variablesArray?: EnvironmentVariable[]; // New format with secret support
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  path: string; // Folder path
  createdAt: string;
  updatedAt: string;
}

export interface Certificate {
  id: string;
  name: string;
  host: string; // Domain this cert applies to (e.g., "api.company.com" or "*" for all)
  pemData: string; // PEM certificate content
  type: 'ca' | 'client'; // CA certificate or client certificate
}

export interface RequestHistoryEntry {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  time: number;
  size: number;
}

export interface ScriptContext {
  pm: {
    environment: {
      get: (key: string) => string;
      set: (key: string, value: string) => void;
    };
    response: ApiResponse;
    test: (name: string, fn: () => void) => void;
  };
}

declare global {
  interface Window {
    electronAPI: {
      // Workspace management
      createWorkspace: (name: string, description?: string) => Promise<{ success: boolean; workspace?: Workspace; error?: string }>;
      loadWorkspaces: () => Promise<{ success: boolean; workspaces: Workspace[] }>;
      setActiveWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
      updateWorkspace: (workspaceId: string, name: string, description?: string) => Promise<{ success: boolean; workspace?: Workspace; error?: string }>;
      deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;

      // Collection management (workspace-aware)
      saveCollection: (workspaceId: string | undefined, data: Collection) => Promise<{ success: boolean; path?: string; error?: string }>;
      loadCollections: (workspaceId?: string) => Promise<{ success: boolean; collections: Collection[] }>;

      // Environment management (workspace-aware, with secrets)
      saveEnvironment: (workspaceId: string | undefined, data: Environment) => Promise<{ success: boolean; path?: string; error?: string }>;
      loadEnvironments: (workspaceId?: string) => Promise<{ success: boolean; environments: Environment[] }>;

      // Certificate management
      saveCertificate: (data: Certificate) => Promise<{ success: boolean; path?: string; error?: string }>;
      loadCertificates: () => Promise<{ success: boolean; certificates: Certificate[] }>;
      deleteCertificate: (id: string) => Promise<{ success: boolean; error?: string }>;
      loadCertificateFile: () => Promise<{ success: boolean; content?: string; error?: string }>;

      // HTTP execution
      executeHttpRequest: (requestConfig: any) => Promise<{ success: boolean; response?: ApiResponse; error?: any }>;

      // Git operations
      gitInit: () => Promise<{ success: boolean; error?: string }>;
      gitStatus: () => Promise<{ success: boolean; status?: any; error?: string }>;

      // Settings
      getSettings: () => Promise<{ success: boolean; settings?: any; error?: string }>;
      updateSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      savePreference: (key: string, value: any) => Promise<{ success: boolean; error?: string }>;
      chooseWorkspaceDirectory: () => Promise<{ success: boolean; directory?: string; error?: string }>;

      // Import
      selectJsonFile: () => Promise<{ success: boolean; content?: string; error?: string }>;

      // History
      loadHistory: (workspaceId: string) => Promise<{ success: boolean; entries?: RequestHistoryEntry[]; error?: string }>;
      saveHistoryEntry: (workspaceId: string, entry: RequestHistoryEntry) => Promise<{ success: boolean; error?: string }>;
      truncateHistory: (workspaceId: string, maxPerRequest: number) => Promise<{ success: boolean; error?: string }>;
    };
  }
}