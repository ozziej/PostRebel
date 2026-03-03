import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit } from 'simple-git';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import * as os from 'os';

let mainWindow: BrowserWindow;

// Settings storage
let cachedSettings: any = null;

async function getSettings(): Promise<any> {
  if (cachedSettings) return cachedSettings;

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    cachedSettings = JSON.parse(content);
  } catch {
    // Default settings
    cachedSettings = {
      workspacesDirectory: path.join(os.homedir(), 'PostalServiceWorkspaces')
    };
  }
  return cachedSettings;
}

async function saveSettings(settings: any): Promise<void> {
  cachedSettings = settings;
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

async function getWorkspacesBaseDir(): Promise<string> {
  const settings = await getSettings();
  return settings.workspacesDirectory;
}

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
    const workspacesDir = await getWorkspacesBaseDir();
    await fs.mkdir(workspacesDir, { recursive: true });

    // Use sanitized name as the workspace ID (folder name)
    let workspaceId = sanitizeFilename(name);

    // Check if workspace already exists, append number if needed
    let counter = 1;
    let finalWorkspaceId = workspaceId;
    while (true) {
      try {
        const testPath = path.join(workspacesDir, finalWorkspaceId);
        await fs.access(testPath);
        // If we get here, folder exists, try next number
        finalWorkspaceId = `${workspaceId}-${counter}`;
        counter++;
      } catch {
        // Folder doesn't exist, we can use this name
        break;
      }
    }

    const workspacePath = await getWorkspacePath(finalWorkspaceId);

    // Create workspace structure
    await fs.mkdir(path.join(workspacePath, 'environments'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'collections'), { recursive: true });

    // Create workspace metadata file
    const workspace = {
      id: finalWorkspaceId,
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

    console.log('[Electron] Created workspace:', finalWorkspaceId);
    return { success: true, workspace };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Settings management
ipcMain.handle('get-settings', async () => {
  try {
    const settings = await getSettings();
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('update-settings', async (event, newSettings) => {
  try {
    await saveSettings(newSettings);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('choose-workspace-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Workspaces Folder',
      buttonLabel: 'Select Folder'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, directory: result.filePaths[0] };
    }

    return { success: false, error: 'No directory selected' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-workspaces', async () => {
  try {
    const workspacesDir = await getWorkspacesBaseDir();

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
          const workspace = JSON.parse(content);

          // IMPORTANT: Use the folder name as the true ID, not what's in the file
          // This fixes manually renamed folders
          workspace.id = entry.name;
          workspace.path = path.join(workspacesDir, entry.name);

          workspaces.push(workspace);
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

ipcMain.handle('update-workspace', async (event, workspaceId, name, description) => {
  try {
    const workspacesDir = await getWorkspacesBaseDir();
    const oldWorkspacePath = path.join(workspacesDir, workspaceId);

    // Use sanitized name as the new workspace ID
    let newWorkspaceId = sanitizeFilename(name);

    // If name hasn't changed (just description update), don't rename folder
    if (newWorkspaceId !== workspaceId) {
      // Check if new name already exists, append number if needed
      let counter = 1;
      let finalWorkspaceId = newWorkspaceId;
      while (true) {
        try {
          const testPath = path.join(workspacesDir, finalWorkspaceId);
          if (testPath !== oldWorkspacePath) {
            await fs.access(testPath);
            // If we get here, folder exists, try next number
            finalWorkspaceId = `${newWorkspaceId}-${counter}`;
            counter++;
          } else {
            break;
          }
        } catch {
          // Folder doesn't exist, we can use this name
          break;
        }
      }

      const newWorkspacePath = path.join(workspacesDir, finalWorkspaceId);

      // Rename the workspace folder
      await fs.rename(oldWorkspacePath, newWorkspacePath);
      workspaceId = finalWorkspaceId;

      console.log('[Electron] Renamed workspace folder:', oldWorkspacePath, '->', newWorkspacePath);
    }

    // Update workspace metadata
    const workspace = {
      id: workspaceId,
      name,
      description: description || '',
      path: path.join(workspacesDir, workspaceId),
      createdAt: new Date().toISOString(), // We don't have the old createdAt, use current
      updatedAt: new Date().toISOString()
    };

    const metadataPath = path.join(workspacesDir, workspaceId, 'workspace.json');
    await fs.writeFile(metadataPath, JSON.stringify(workspace, null, 2));

    console.log('[Electron] Updated workspace:', workspaceId);
    return { success: true, workspace };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('delete-workspace', async (event, workspaceId) => {
  try {
    const workspacesDir = await getWorkspacesBaseDir();
    const workspacePath = path.join(workspacesDir, workspaceId);

    // Delete the entire workspace folder
    await fs.rm(workspacePath, { recursive: true, force: true });

    console.log('[Electron] Deleted workspace:', workspaceId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Helper functions for workspace management
async function getWorkspacePath(workspaceId?: string): Promise<string> {
  if (!workspaceId) {
    // Backward compatibility: use old structure
    return process.cwd();
  }
  const workspacesDir = await getWorkspacesBaseDir();
  return path.join(workspacesDir, workspaceId);
}

// Sanitize filename to be filesystem-safe
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, '-') // Replace spaces with dash
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 255); // Limit length
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
    const basePath = await getWorkspacePath(workspaceId);
    const collectionsDir = workspaceId
      ? path.join(basePath, 'collections')
      : path.join(basePath, 'collections');
    await fs.mkdir(collectionsDir, { recursive: true });

    // Sanitize the filename
    const sanitizedName = sanitizeFilename(data.name);
    const newFilename = `${sanitizedName}.json`;
    const newSecretsFilename = `${sanitizedName}.secrets.json`;

    // Check if this collection was previously saved with a different name
    if (data._previousFilename && data._previousFilename !== newFilename) {
      // Delete old files
      try {
        const oldPath = path.join(collectionsDir, data._previousFilename);
        await fs.unlink(oldPath);
        console.log('[Electron] Deleted old collection file:', data._previousFilename);
      } catch (err) {
        // File might not exist, that's okay
      }

      try {
        const oldSecretsPath = path.join(collectionsDir, data._previousFilename.replace('.json', '.secrets.json'));
        await fs.unlink(oldSecretsPath);
        console.log('[Electron] Deleted old secrets file');
      } catch (err) {
        // Secrets file might not exist, that's okay
      }
    }

    // Split secrets
    const { public: publicData, secrets } = splitSecrets(data);

    // Store the current filename in the data for future renames
    publicData._previousFilename = newFilename;

    // Save public data
    const filePath = path.join(collectionsDir, newFilename);
    await fs.writeFile(filePath, JSON.stringify(publicData, null, 2));

    // Save secrets if any
    if (Object.keys(secrets.requests || {}).length > 0) {
      const secretsPath = path.join(collectionsDir, newSecretsFilename);
      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
    }

    console.log('[Electron] Saved collection:', newFilename);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-collections', async (event, workspaceId) => {
  try {
    const basePath = await getWorkspacePath(workspaceId);
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
    const basePath = await getWorkspacePath(workspaceId);
    const envDir = workspaceId
      ? path.join(basePath, 'environments')
      : path.join(basePath, 'environments');
    await fs.mkdir(envDir, { recursive: true });

    // Sanitize the filename
    const sanitizedName = sanitizeFilename(data.name);
    const newFilename = `${sanitizedName}.json`;
    const newSecretsFilename = `${sanitizedName}.secrets.json`;

    // Check if this environment was previously saved with a different name
    if (data._previousFilename && data._previousFilename !== newFilename) {
      // Delete old files
      try {
        const oldPath = path.join(envDir, data._previousFilename);
        await fs.unlink(oldPath);
        console.log('[Electron] Deleted old environment file:', data._previousFilename);
      } catch (err) {
        // File might not exist, that's okay
      }

      try {
        const oldSecretsPath = path.join(envDir, data._previousFilename.replace('.json', '.secrets.json'));
        await fs.unlink(oldSecretsPath);
        console.log('[Electron] Deleted old environment secrets file');
      } catch (err) {
        // Secrets file might not exist, that's okay
      }
    }

    // Split secrets from environment variables
    const { public: publicData, secrets } = splitSecrets(data);

    // Store the current filename in the data for future renames
    publicData._previousFilename = newFilename;

    // Save public data
    const filePath = path.join(envDir, newFilename);
    await fs.writeFile(filePath, JSON.stringify(publicData, null, 2));

    // Save secrets if any
    if (secrets.variables && Object.keys(secrets.variables).length > 0) {
      const secretsPath = path.join(envDir, newSecretsFilename);
      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
    }

    console.log('[Electron] Saved environment:', newFilename);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('load-environments', async (event, workspaceId) => {
  try {
    const basePath = await getWorkspacePath(workspaceId);
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