# Workspaces & Secrets Management Guide

## Overview

PostRebel now includes a complete workspace system with automatic secrets management. This allows you to organize projects, collaborate via git, and keep sensitive credentials secure.

## What are Workspaces?

A **workspace** is a self-contained project with its own:
- Collections (API requests)
- Environments (variables)
- Secrets (kept separate from git)

All workspaces live under a single workspaces root directory (e.g. `~/PostRebelWorkspaces/`) which has one shared git repository. Each workspace is stored in its own sub-folder: `./workspaces/{workspace-id}/`

## Workspace Structure

```
/workspaces/                        # Workspaces root directory
  .git/                             # Shared git repo (all workspaces)
  .gitignore                        # Auto-managed (excludes *.secrets.json etc.)
  /my-api-project-123456789/
    workspace.json                  # Project metadata
    /environments/
      development.json              # Public variables (COMMITTED)
      development.secrets.json      # Secret variables (GITIGNORED)
      production.json
      production.secrets.json
    /collections/
      api-tests.json                # Requests without secrets (COMMITTED)
      api-tests.secrets.json        # Secret form parameters (GITIGNORED)
    /history/
      history.json                  # Request execution history (LOCAL ONLY)
```

## Creating a Workspace

1. Click the **⚙️ gear icon** in the sidebar workspace section
2. Click **"+ New Workspace"**
3. Enter:
   - **Name**: Your project name (e.g., "My API Project")
   - **Description**: Optional details about the project
4. Click **"Create Workspace"**

The system will:
- Create the folder structure
- Ensure a git repository exists at the workspaces root (creates one if none exists; skips if one is already present, e.g. from a clone)
- Ensure the `.gitignore` at the workspaces root excludes `*.secrets.json` and other non-tracked files
- Switch to the new workspace

## Switching Workspaces

Use the dropdown in the sidebar **Workspace** section to switch between workspaces. When you switch:
- All collections and environments reload from the new workspace
- The active environment resets
- Current request/response is cleared

## Secrets Management

### What is a Secret?

A **secret** is any sensitive data that shouldn't be committed to git:
- Passwords
- API keys
- Tokens
- Client secrets
- Private URLs

### Marking Items as Secret

#### Environment Variables

1. Click **"📝 Edit Variables"** in the sidebar
2. For each secret variable, click the **🔓** button
3. It turns to **🔒** with a red background
4. Click **"Save Changes"**

**Result**:
- Public variables → `development.json` (committed)
- Secret variables → `development.secrets.json` (gitignored)

#### Form Parameters

1. In the request body (form-data or x-www-form-urlencoded)
2. Click the **🔓** button next to any parameter
3. It turns to **🔒** with a red background
4. Changes auto-save

**Result**:
- Public parameters → `collection.json` (committed)
- Secret parameters → `collection.secrets.json` (gitignored)

### Visual Indicators

Secret items show:
- 🔒 **Red lock icon**
- **Red border and background**
- **Password input masking** (in forms)
- Tooltip: "Secret (will not be committed)"

### How Secrets Work

When you save:
1. System automatically splits data
2. Non-secret data → `.json` file (safe to commit)
3. Secret data → `.secrets.json` file (gitignored)
4. Variable/parameter names are shared, values stay private

When you load:
1. Loads public `.json` file
2. Loads `.secrets.json` if it exists
3. Automatically merges secrets back
4. You see complete data with secrets filled in

## Git Workflow

### Initial Setup

```bash
cd ~/PostRebelWorkspaces/   # or your configured workspaces directory
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

Because all workspaces share one git repo, a single commit can include changes across multiple workspaces.

### What Gets Committed

✅ **Committed (safe to share)**:
- `*/workspace.json` - Project metadata
- `*/environments/*.json` - Variable names (not values marked as secret)
- `*/collections/*.json` - Requests (without secret parameters)
- `.gitignore` - Ensures secrets stay private

❌ **NOT Committed (stays local)**:
- `*.secrets.json` - All secret values
- `*.local.json` - Local overrides
- `*/saved-responses/` - Saved response snapshots

### Team Collaboration

**Person 1 (creates project):**
```bash
cd ~/PostRebelWorkspaces/
git add .
git commit -m "Add API collection"
git push
```

**Person 2 (clones project):**
```bash
git clone <repo-url> ~/PostRebelWorkspaces/
# Point PostRebel's workspaces directory to this folder in Settings
# Edit environment variables
# Mark secrets and add your own values
# *.secrets.json files are created locally (not committed)
```

**Benefits:**
- Share API structure and variable names
- Each person keeps their own credentials
- No risk of committing secrets
- Easy onboarding for new team members

## Current Workspace Features

The current implementation includes:
- ✅ Workspace creation, editing, and deletion
- ✅ Automatic secrets splitting/merging
- ✅ Shared git repo at workspaces root (initialized on first workspace creation; existing repos are reused)
- ✅ Auto-managed `.gitignore` at workspaces root
- ✅ Visual indicators for secrets
- ✅ Per-request execution history with configurable retention
- ✅ Configurable workspaces storage directory
- ✅ Drag and drop for reordering requests and folders
- ✅ Backward compatible (works without workspaces)

Note: If you have existing collections/environments in the old structure (root-level `collections/` and `environments/` folders), they will still work. Select "No Workspace" in the dropdown to access them.

## Migration from Old Structure

If you have existing data:

1. Create a new workspace (e.g., "Default Project")
2. Manually move files:
   ```bash
   mv collections/* workspaces/{workspace-id}/collections/
   mv environments/* workspaces/{workspace-id}/environments/
   ```
3. Switch to the new workspace
4. Mark any sensitive data as secret
5. Commit to git

## Best Practices

### 1. Naming Conventions

- **Workspace names**: Descriptive (e.g., "Customer API v2")
- **Variable names**: Clear purpose (e.g., `api_key`, `db_password`)
- **Collection names**: Feature-based (e.g., "Authentication", "User Management")

### 2. Secret Management

Mark these as secrets:
- `api_key`, `api_secret`
- `password`, `token`, `jwt`
- `client_id`, `client_secret`
- `private_key`, `certificate`
- Any production URLs with credentials

Keep public:
- `base_url` (unless it contains credentials)
- `api_version`
- `timeout` settings
- Feature flags

### 3. Git Commits

```bash
# Good commit messages
git commit -m "Add user authentication endpoints"
git commit -m "Update staging environment base URL"

# Before committing
git status  # Verify no .secrets.json files
git diff    # Review changes
```

### 4. Team Workflow

1. Create workspace and initial setup
2. Commit structure to git
3. Document required secrets in README
4. Team members clone and add their secrets
5. Regular commits (structure changes only)
6. Pull requests for API updates

## Troubleshooting

### Secrets Not Saving

**Problem**: Changes to secrets don't persist

**Solution**:
1. Check if workspace is selected (not "No Workspace")
2. Verify write permissions in workspace folder
3. Check console for errors (View > Toggle Developer Tools)

### Secrets Committed to Git

**Problem**: `.secrets.json` files appear in git status

**Solution**:
```bash
# Remove from git (keeps local file)
git rm --cached *.secrets.json

# Verify .gitignore exists and contains:
echo "*.secrets.json" >> .gitignore

# Commit the removal
git commit -m "Remove secrets from git"
```

### Can't See Secrets After Clone

**Problem**: Variables show empty values after cloning

**Solution**: This is expected! Each team member must:
1. Open environment variables editor
2. Fill in their own secret values
3. System creates `.secrets.json` locally

### Workspace Not Loading

**Problem**: Collections/environments don't appear

**Solution**:
1. Check workspace folder exists: `workspaces/{workspace-id}/`
2. Verify `workspace.json` exists
3. Check file permissions
4. Try restarting the application

## Examples

### Example 1: API Development Team

**Setup**:
```
Workspace: "Payment API v2"
Environments: development, staging, production
Collections: "Auth", "Payments", "Webhooks"
```

**Team workflow**:
1. Lead creates workspace and initial collection
2. Adds environment variables (marks secrets)
3. Commits and shares repo
4. Team members clone
5. Each adds their own API keys to `.secrets.json`
6. Collaborate on API tests

### Example 2: Multi-Project Freelancer

**Setup**:
```
Workspace 1: "Client A - E-commerce API"
Workspace 2: "Client B - Analytics API"
Workspace 3: "Personal Projects"
```

**Benefits**:
- Keep projects completely separate
- Switch contexts easily
- Each has own git history
- No credential mix-ups

## Security Notes

- **.secrets.json files are NEVER committed** (enforced by the auto-managed `.gitignore` at the workspaces root)
- **Mark all sensitive data as secret** before first commit
- **Review git diff** before committing to verify no secrets
- **Use different credentials per environment** (dev/staging/prod)
- **Rotate secrets regularly** (just update `.secrets.json`)

## Future Enhancements

Planned features:
- Import/export workspaces
- Workspace templates
- Encrypted secrets storage
- Cloud sync for secrets (optional)
- Workspace search/filter
