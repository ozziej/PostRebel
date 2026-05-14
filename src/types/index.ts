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
    type: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary';
    rawSubtype?: 'text' | 'javascript' | 'json' | 'html' | 'xml';
    data: string | FormData | Record<string, string>;
    formData?: Array<KeyValuePair>;
    binaryFilePath?: string;
    binaryFileName?: string;
  };
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'jwt' | 'inherit';
    bearer?: string;
    basic?: { username: string; password: string };
    jwt?: string;
  };
  preRequestScript?: string;
  testScript?: string;
}

export interface CollectionFolder {
  id: string;
  name: string;
  requests: ApiRequest[];
}

export interface Collection {
  id: string;
  name: string;
  requests: ApiRequest[];
  folders?: CollectionFolder[];
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'jwt';
    bearer?: string;
    basic?: { username: string; password: string };
    jwt?: string;
  };
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

export interface SavedResponse {
  id: string;
  name: string;
  requestId: string;
  timestamp: string;
  request: ApiRequest;
  response: ApiResponse;
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

export interface DataMapping {
  fromExpression: string; // e.g. "body.token" or "status"
  toVariable: string;     // e.g. "authToken" → used as {{authToken}}
}

export interface RunnerEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: {
    mappings?: DataMapping[];
    condition?: string;  // JS script: return true to follow this edge
    output?: string;     // expression to log when this edge is followed (body.x, {{var}}, status)
  };
}

export interface RunnerNodeData extends Record<string, unknown> {
  label: string;
  requestId?: string;                                     // request nodes
  variables?: { key: string; value: string }[];          // start node: env overrides
  delayMs?: number;                                       // delay nodes
  foreachExpression?: string;                             // foreach: array source (body.x.y or varName)
  foreachItemVar?: string;                                // foreach: variable prefix for each item
  debugScript?: string;                                   // debug nodes: JS script with console.log
  retryMaxAttempts?: number;           // retry node: max attempts (default 3)
  retryInitialDelayMs?: number;        // retry node: initial wait in ms (default 1000)
  retryBackoffMultiplier?: number;     // retry node: multiplier per attempt (default 2)
  retryCondition?: string;             // retry node: JS returning true = stop retrying
  assignments?: Array<{ variable: string; expression: string }>; // setvariable node
}

export interface RunnerNode {
  id: string;
  type: 'start' | 'request' | 'end' | 'delay' | 'foreach' | 'debug' | 'retry' | 'setvariable';
  position: { x: number; y: number };
  data: RunnerNodeData;
}

// Runtime-only log entries produced during execution
export interface RunnerLogEntry {
  level: 'info' | 'success' | 'warn' | 'error' | 'script';
  message: string;
  timestamp?: number; // ms since epoch — injected by the UI when the entry is received
}

export interface Runner {
  id: string;
  name: string;
  collectionId: string;
  workspaceId: string;
  nodes: RunnerNode[];
  edges: RunnerEdge[];
  createdAt: string;
  updatedAt: string;
}

// Runtime-only (not persisted)
export interface RunnerNodeResult {
  nodeId: string;
  status: 'idle' | 'running' | 'success' | 'error';
  response?: ApiResponse;
  request?: ApiRequest;   // the request that was executed (pre-resolution template)
  error?: string;
}

export interface RunHistory {
  id: string;
  runnerId: string;
  workspaceId: string;
  runnerName: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'error' | 'aborted';
  logs: RunnerLogEntry[];
  nodeResults: Record<string, RunnerNodeResult>;
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
      deleteCollection: (workspaceId: string | undefined, collectionName: string) => Promise<{ success: boolean; error?: string }>;

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
      selectBinaryFile: () => Promise<{ success: boolean; filePath?: string; fileName?: string; base64Data?: string; error?: string }>;

      // History
      loadHistory: (workspaceId: string) => Promise<{ success: boolean; entries?: RequestHistoryEntry[]; error?: string }>;
      saveHistoryEntry: (workspaceId: string, entry: RequestHistoryEntry) => Promise<{ success: boolean; error?: string }>;
      truncateHistory: (workspaceId: string, maxPerRequest: number) => Promise<{ success: boolean; error?: string }>;

      // Saved Responses
      loadSavedResponses: (workspaceId: string) => Promise<{ success: boolean; entries?: SavedResponse[]; error?: string }>;
      saveSavedResponse: (workspaceId: string, entry: SavedResponse) => Promise<{ success: boolean; error?: string }>;
      deleteSavedResponse: (workspaceId: string, entryId: string) => Promise<{ success: boolean; error?: string }>;
      renameSavedResponse: (workspaceId: string, entryId: string, newName: string) => Promise<{ success: boolean; error?: string }>;

      // Runner management
      loadRunners: (workspaceId: string) => Promise<{ success: boolean; runners: Runner[] }>;
      saveRunner: (workspaceId: string, runner: Runner) => Promise<{ success: boolean; error?: string }>;
      deleteRunner: (workspaceId: string, runnerId: string) => Promise<{ success: boolean; error?: string }>;
      loadRunnerHistory: (workspaceId: string, runnerId: string) => Promise<{ success: boolean; entries: RunHistory[] }>;
      saveRunnerHistory: (workspaceId: string, entry: RunHistory) => Promise<{ success: boolean; error?: string }>;
    };
  }
}