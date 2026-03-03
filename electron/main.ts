import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit } from 'simple-git';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';

let mainWindow: BrowserWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Workspace management
ipcMain.handle('create-workspace', async (event, name, description) => {
  try {
    const workspaceId = Date.now().toString();
    const workspacePath = getWorkspacePath(workspaceId);

    // Create workspace structure
    await fs.mkdir(path.join(workspacePath, 'environments'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'collections'), { recursive: true });

    // Create workspace metadata file
    const workspace = {
      id: workspaceId,
      name,
      description: description || '',
      path: workspacePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const metadataPath = path.join(workspacePath, 'workspace.json');
    await fs.writeFile(metadataPath, JSON.stringify(workspace, null, 2));

    // Initialize git in workspace
    const git = simpleGit(workspacePath);
    await git.init();

    // Create .gitignore for workspace
    const gitignorePath = path.join(workspacePath, '.gitignore');
    const gitignoreContent = `
*.secrets.json
*.local.json
.DS_Store
node_modules/
    `.trim();
    await fs.writeFile(gitignorePath, gitignoreContent);

    return { success: true, workspace };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-workspaces', async () => {
  try {
    const workspacesDir = path.join(process.cwd(), 'workspaces');

    // Ensure workspaces directory exists
    try {
      await fs.access(workspacesDir);
    } catch {
      await fs.mkdir(workspacesDir, { recursive: true });
      return { success: true, workspaces: [] };
    }

    const entries = await fs.readdir(workspacesDir, { withFileTypes: true });
    const workspaces = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(workspacesDir, entry.name, 'workspace.json');
        try {
          const content = await fs.readFile(metadataPath, 'utf-8');
          workspaces.push(JSON.parse(content));
        } catch {
          // Skip directories without workspace.json
        }
      }
    }

    return { success: true, workspaces };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('set-active-workspace', async (event, workspaceId) => {
  try {
    // Store active workspace preference (could save to user config file)
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Helper functions for workspace management
function getWorkspacePath(workspaceId?: string): string {
  if (!workspaceId) {
    // Backward compatibility: use old structure
    return process.cwd();
  }
  return path.join(process.cwd(), 'workspaces', workspaceId);
}

function splitSecrets(data: any): { public: any; secrets: any } {
  const publicData = JSON.parse(JSON.stringify(data)); // deep clone
  const secrets: any = {};

  // Handle environment variables
  if (data.variablesArray) {
    publicData.variablesArray = [];
    secrets.variables = {};

    data.variablesArray.forEach((v: any) => {
      if (v.isSecret) {
        secrets.variables[v.key] = v.value;
        publicData.variablesArray.push({ key: v.key, value: '', isSecret: true });
      } else {
        publicData.variablesArray.push(v);
      }
    });
  }

  // Handle form data secrets in requests
  if (data.requests) {
    secrets.requests = {};
    data.requests.forEach((req: any, idx: number) => {
      if (req.body?.formData) {
        const secretParams: any = {};
        req.body.formData = req.body.formData.map((param: any) => {
          if (param.isSecret) {
            secretParams[param.key] = param.value;
            return { ...param, value: '' };
          }
          return param;
        });
        if (Object.keys(secretParams).length > 0) {
          secrets.requests[req.id] = { formData: secretParams };
        }
      }
    });
  }

  return { public: publicData, secrets };
}

// IPC Handlers for file operations
ipcMain.handle('save-collection', async (event, workspaceId, data) => {
  try {
    const basePath = getWorkspacePath(workspaceId);
    const collectionsDir = workspaceId
      ? path.join(basePath, 'collections')
      : path.join(basePath, 'collections');
    await fs.mkdir(collectionsDir, { recursive: true });

    // Split secrets
    const { public: publicData, secrets } = splitSecrets(data);

    // Save public data
    const filePath = path.join(collectionsDir, `${data.name}.json`);
    await fs.writeFile(filePath, JSON.stringify(publicData, null, 2));

    // Save secrets if any
    if (Object.keys(secrets.requests || {}).length > 0) {
      const secretsPath = path.join(collectionsDir, `${data.name}.secrets.json`);
      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
    }

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-collections', async (event, workspaceId) => {
  try {
    const basePath = getWorkspacePath(workspaceId);
    const collectionsDir = workspaceId
      ? path.join(basePath, 'collections')
      : path.join(basePath, 'collections');
    const files = await fs.readdir(collectionsDir);
    const collections = [];

    for (const file of files) {
      if (file.endsWith('.json') && !file.endsWith('.secrets.json')) {
        const content = await fs.readFile(path.join(collectionsDir, file), 'utf-8');
        const collection = JSON.parse(content);

        // Try to load secrets
        const secretsFile = file.replace('.json', '.secrets.json');
        try {
          const secretsContent = await fs.readFile(path.join(collectionsDir, secretsFile), 'utf-8');
          const secrets = JSON.parse(secretsContent);

          // Merge secrets back into collection
          if (secrets.requests) {
            collection.requests.forEach((req: any) => {
              if (secrets.requests[req.id]?.formData) {
                req.body.formData = req.body.formData.map((param: any) => {
                  if (param.isSecret && secrets.requests[req.id].formData[param.key]) {
                    return { ...param, value: secrets.requests[req.id].formData[param.key] };
                  }
                  return param;
                });
              }
            });
          }
        } catch {
          // No secrets file, continue
        }

        collections.push(collection);
      }
    }

    return { success: true, collections };
  } catch (error) {
    return { success: true, collections: [] }; // Empty if directory doesn't exist
  }
});

ipcMain.handle('save-environment', async (event, workspaceId, data) => {
  try {
    const basePath = getWorkspacePath(workspaceId);
    const envDir = workspaceId
      ? path.join(basePath, 'environments')
      : path.join(basePath, 'environments');
    await fs.mkdir(envDir, { recursive: true });

    // Split secrets from environment variables
    const { public: publicData, secrets } = splitSecrets(data);

    // Save public data
    const filePath = path.join(envDir, `${data.name}.json`);
    await fs.writeFile(filePath, JSON.stringify(publicData, null, 2));

    // Save secrets if any
    if (secrets.variables && Object.keys(secrets.variables).length > 0) {
      const secretsPath = path.join(envDir, `${data.name}.secrets.json`);
      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
    }

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-environments', async (event, workspaceId) => {
  try {
    const basePath = getWorkspacePath(workspaceId);
    const envDir = workspaceId
      ? path.join(basePath, 'environments')
      : path.join(basePath, 'environments');
    const files = await fs.readdir(envDir);
    const environments = [];

    for (const file of files) {
      if (file.endsWith('.json') && !file.includes('.local.') && !file.endsWith('.secrets.json')) {
        const content = await fs.readFile(path.join(envDir, file), 'utf-8');
        const environment = JSON.parse(content);

        // Try to load secrets
        const secretsFile = file.replace('.json', '.secrets.json');
        try {
          const secretsContent = await fs.readFile(path.join(envDir, secretsFile), 'utf-8');
          const secrets = JSON.parse(secretsContent);

          // Merge secrets back into environment
          if (secrets.variables && environment.variablesArray) {
            environment.variablesArray = environment.variablesArray.map((v: any) => {
              if (v.isSecret && secrets.variables[v.key]) {
                return { ...v, value: secrets.variables[v.key] };
              }
              return v;
            });
          }
        } catch {
          // No secrets file, continue
        }

        environments.push(environment);
      }
    }

    return { success: true, environments };
  } catch (error) {
    return { success: true, environments: [] };
  }
});

// Git operations
ipcMain.handle('git-init', async () => {
  try {
    const git = simpleGit();
    await git.init();

    // Create .gitignore
    const gitignore = `
node_modules/
dist/
.env.local
environments/*.local.json
*.log
.DS_Store
`;
    await fs.writeFile('.gitignore', gitignore.trim());

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('git-status', async () => {
  try {
    const git = simpleGit();
    const status = await git.status();
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Certificate management
ipcMain.handle('save-certificate', async (event, data) => {
  try {
    const certsDir = path.join(process.cwd(), 'certificates');
    await fs.mkdir(certsDir, { recursive: true });

    const filePath = path.join(certsDir, `${data.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-certificates', async () => {
  try {
    const certsDir = path.join(process.cwd(), 'certificates');
    const files = await fs.readdir(certsDir);
    const certificates = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(certsDir, file), 'utf-8');
        certificates.push(JSON.parse(content));
      }
    }

    return { success: true, certificates };
  } catch (error) {
    return { success: true, certificates: [] }; // Empty if directory doesn't exist
  }
});

ipcMain.handle('delete-certificate', async (event, id) => {
  try {
    const certsDir = path.join(process.cwd(), 'certificates');
    const filePath = path.join(certsDir, `${id}.json`);
    await fs.unlink(filePath);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-certificate-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Certificate Files', extensions: ['pem', 'crt', 'cer', 'p7b', 'p7c'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'No file selected' };
    }

    const content = await fs.readFile(result.filePaths[0], 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// HTTP Request handler - runs in Node.js, no CORS restrictions!
ipcMain.handle('execute-http-request', async (event, requestConfig) => {
  const startTime = Date.now();

  try {
    console.log('[Main Process] Executing HTTP request:', {
      method: requestConfig.method,
      url: requestConfig.url,
      hasAuth: !!requestConfig.headers?.Authorization
    });

    // Create https agent with certificate handling
    const httpsAgent = new https.Agent({
      rejectUnauthorized: requestConfig.rejectUnauthorized !== false,
      // Add certificate support if needed
      ca: requestConfig.ca,
      cert: requestConfig.cert,
      key: requestConfig.key
    });

    const config: AxiosRequestConfig = {
      method: requestConfig.method,
      url: requestConfig.url,
      headers: requestConfig.headers || {},
      data: requestConfig.data,
      timeout: requestConfig.timeout || 30000,
      httpsAgent,
      // Important: This allows axios to work in Node.js without CORS
      maxRedirects: 5,
      validateStatus: () => true // Accept all status codes
    };

    const response = await axios(config);
    const endTime = Date.now();

    console.log('[Main Process] Request completed:', {
      status: response.status,
      statusText: response.statusText,
      time: endTime - startTime
    });

    return {
      success: true,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        time: endTime - startTime,
        size: JSON.stringify(response.data).length
      }
    };

  } catch (error: any) {
    const endTime = Date.now();

    console.error('[Main Process] Request failed:', {
      code: error.code,
      message: error.message,
      hasResponse: !!error.response
    });

    if (error.response) {
      // Server responded with error status
      return {
        success: true,
        response: {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
          time: endTime - startTime,
          size: JSON.stringify(error.response.data || '').length
        }
      };
    } else {
      // Network error
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          time: endTime - startTime
        }
      };
    }
  }
});