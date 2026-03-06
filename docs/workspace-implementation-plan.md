# Workspace & Secrets Implementation Plan (COMPLETED)

## Overview
Implement a workspace-based project structure with automatic secrets management to prevent credentials from being committed to git. **This plan has been fully implemented.**

## Folder Structure

```
/workspaces/
  /workspace-id-1/
    workspace.json              # Metadata: { id, name, description, createdAt, updatedAt }
    /environments/
      development.json          # Public variables (COMMITTED)
      development.secrets.json  # Secret variables (GITIGNORED)
      production.json
      production.secrets.json
    /collections/
      api-tests.json            # Requests without secret values (COMMITTED)
      api-tests.secrets.json    # Secret form parameters (GITIGNORED)
```

## Implementation Steps

### 1. Types (COMPLETED ✓)
- [x] Add `Workspace` interface
- [x] Add `EnvironmentVariable` with `isSecret` flag
- [x] Add `KeyValuePair` with `isSecret` flag
- [x] Update Window.electronAPI interface for workspace methods

### 2. UI Components

#### KeyValueEditor (COMPLETED ✓)
- [x] Add `allowSecrets` prop
- [x] Show 🔒/🔓 button when `allowSecrets=true`
- [x] Visual indicator (red border/background) for secret items
- [x] Use password input type for secret values

#### WorkspaceSelector (NEW)
```tsx
- Dropdown showing all workspaces
- "New Workspace" button
- Shows active workspace name
- Placed in sidebar header
```

#### WorkspaceManager (NEW)
```tsx
- Modal dialog to create/edit/delete workspaces
- Form: name, description
- List of existing workspaces with actions
```

### 3. Electron Backend Changes

#### New IPC Handlers
```typescript
// Workspace management
ipcMain.handle('create-workspace', async (event, name, description))
ipcMain.handle('load-workspaces', async ())
ipcMain.handle('set-active-workspace', async (event, workspaceId))
ipcMain.handle('delete-workspace', async (event, workspaceId))
```

#### Updated IPC Handlers
```typescript
// All take workspaceId as first parameter
ipcMain.handle('save-collection', async (event, workspaceId, data))
ipcMain.handle('load-collections', async (event, workspaceId))
ipcMain.handle('save-environment', async (event, workspaceId, data))
ipcMain.handle('load-environments', async (event, workspaceId))
```

#### Helper Functions
```typescript
function splitSecrets(data: any, secretKeys: string[]): { public: any, secrets: any }
function mergeSecrets(publicData: any, secretsData: any): any
function getWorkspacePath(workspaceId: string): string
function ensureWorkspaceStructure(workspaceId: string): Promise<void>
```

### 4. Preload Script Updates
- Expose new workspace methods
- Update existing methods to pass workspaceId

### 5. App.tsx Updates
- Add workspace state: `activeWorkspace`
- Load workspaces on mount
- Pass workspaceId to all save/load operations
- Add workspace selector to UI

### 6. Migration Strategy

#### For Existing Data
```typescript
// On first run, detect if old structure exists
if (fs.existsSync('./collections') || fs.existsSync('./environments')) {
  // Create a "Default" workspace
  // Move existing files into workspace structure
  // Show migration complete message
}
```

### 7. Git Integration
- A single shared git repo is initialized at the workspaces root directory (not per workspace)
- If the directory already contains a repo (e.g. from a clone), it is reused
- `.gitignore` at the workspaces root is auto-managed to always exclude `*.secrets.json`, `*.local.json`, `saved-responses/`, `.DS_Store`, and `node_modules/`
- Git operations (add, commit, push) are run from the workspaces root to capture all workspaces in one repo

## User Flow

### Creating a Workspace
1. Click "New Workspace" in sidebar
2. Enter name and description
3. Creates folder structure automatically
4. Switches to new workspace

### Marking Items as Secret
1. In environment editor: Click 🔓 next to variable
2. In request editor: Click 🔓 next to form parameter
3. Turns red, shows 🔒 icon
4. Automatically saved to `.secrets.json`

### Sharing Projects
1. Commit workspace folder to git
2. `.secrets.json` files are ignored
3. Team members clone repo
4. Each creates their own `.secrets.json` with their values
5. Variable names are shared, values stay private

## Security Benefits
- Secrets never committed to git
- Visual indicators for secret items
- Password-masked input fields
- Automatic separation during save
- Per-workspace isolation

## Migration Path
- Detects old structure on first launch
- Auto-migrates to "Default" workspace
- No data loss
- Can continue using immediately

## Resolved Questions
1. **Workspaces location** — User-selectable via Settings (defaults to `~/PostRebelWorkspaces`).
2. **Auto-create default** — No auto-create; users create workspaces on demand.
3. **Multiple workspaces open** — One active workspace at a time; switch via the top bar dropdown.
4. **Export/import** — Not yet implemented; on the roadmap.
