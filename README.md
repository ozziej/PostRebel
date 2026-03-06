![PostRebel Logo](assets/logo.png)
# PostRebel

A local API testing tool with git support - your Postman alternative.

## Features

✅ **Current Features:**
- Make API calls (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Authentication support (Bearer, Basic, JWT)
- Variable templating with `{{variable}}` syntax
- Pre-request and test scripts with Postman-compatible `pm` object
- Local file storage with git support
- Environment management with variable editor
- Token extraction from responses
- **Certificate management** - Import custom CA certificates for internal APIs
- **Postman V2 collection and environment import**
- **cURL command import**
- **OpenAPI / Swagger import** - Import OpenAPI 3.x (3.0, 3.1) and Swagger 2.0 specs in JSON or YAML; endpoints are automatically grouped into tag-based folders within the collection
- **Request body types** - None, Raw (JSON, Text, JavaScript, HTML, XML), x-www-form-urlencoded, form-data, and Binary file upload
- **Response syntax highlighting** - JSON and XML responses are colour-coded with distinct colours for keys, string values, numbers, booleans, tag names, and attributes
- **Drag and drop** - Reorder requests and folders in the sidebar by dragging; drag requests between folders to move them
- **Workspace management** - Organize projects into separate workspaces with a shared git repo at the workspaces root directory
- **Secrets management** - Mark variables and form parameters as secret; secrets are automatically split into `.secrets.json` files and gitignored
- **Request history** - Per-request execution log showing status, timing, and size; persisted per workspace and auto-pruned to a configurable maximum
- **Saved responses** - Snapshot and name any response for future reference; saved responses are listed under their parent request in the sidebar
- **Collection folders** - Group requests inside a collection; add folders manually or have them created automatically on OpenAPI import (one folder per tag); drag and drop to reorder and move requests between folders

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

This will:
- Start the React development server on `http://localhost:3000`
- Launch the Electron app automatically
- Enable hot reload for development

## Project Structure

```
PostRebel/
├── workspaces/               # Workspace projects (single git repo at this level)
│   ├── .git/                       # Shared git repo for all workspaces
│   ├── .gitignore                  # Auto-managed (excludes *.secrets.json etc.)
│   └── my-project-123456/
│       ├── workspace.json          # Project metadata
│       ├── collections/            # API collections (committed)
│       ├── environments/           # Environment configs (committed)
│       │   ├── dev.json            # Public variables
│       │   └── dev.secrets.json    # Secret variables (gitignored)
│       ├── history/                # Request execution history
│       │   └── history.json        # Log entries (local only)
│       └── certificates/           # Custom certificates (NOT committed)
├── src/                  # React app source
├── electron/            # Electron main process
└── dist/               # Built files
```

## Usage

### Making API Calls

1. Select an environment from the top bar
2. Choose a request from a collection in the sidebar
3. Modify URL, headers, body, or auth as needed
4. Click "Send"

### Token Flow Example

The sample collection demonstrates a common auth flow:

1. **Get Auth Token** - Login request that extracts token from response
2. **Get User Profile** - Uses the extracted token via `{{auth_token}}`

### Variables

Use `{{variable_name}}` in:
- URLs: `https://{{api_base}}/users`
- Headers: `Authorization: Bearer {{token}}`
- Request bodies: `{"api_key": "{{api_key}}"}`

### Scripts

**Pre-request scripts** run before sending:
```javascript
pm.environment.set("timestamp", Date.now());
console.log("About to send request");
```

**Test scripts** run after receiving response:
```javascript
// Test the response
pm.test("Status is 200", () => {
    pm.expect(pm.response.status).to.equal(200);
});

// Extract and save token
const response = pm.response.json();
if (response.access_token) {
    pm.environment.set("token", response.access_token);
}
```

### Importing

The **⬆️ Import** button in the top menu bar opens the import dialog, which has four tabs:

#### Postman Collection
Import a Postman v2.0 or v2.1 collection JSON file. All requests, headers, body content, authentication, and pre/post scripts are preserved.

#### Postman Environment
Import a Postman environment JSON file. Variables and secret flags are preserved.

#### Curl Command
Paste a cURL command (e.g. copied from browser DevTools → "Copy as cURL") to create a new request. You can name the request and choose which collection to add it to, or create a new one.

#### OpenAPI / Swagger
Paste an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML). PostRebel will:
- Parse all paths and HTTP methods into `ApiRequest` objects
- Convert `{pathParam}` path parameters to `{{pathParam}}` variable syntax
- Append required query parameters as `{{paramName}}` placeholders
- Map security schemes (Bearer, Basic, API Key, OAuth2) to the appropriate auth type
- Extract request body examples or generate one from the schema
- If multiple named examples exist for an operation, create one request per example
- Group operations by their first tag into **collection folders**; untagged operations go to the collection root

You can import into an existing collection (folders will be merged in) or create a new one named after the spec title.

### Request History

Every time you execute a request, PostRebel records the result (method, resolved URL, status code, response time, and size) in a per-workspace history log.

- Click the **History** button next to **Send** to toggle the history panel for the active request.
- Entries are sorted newest-first and color-coded by status (green for 2xx, yellow for 3xx, red for 4xx/5xx).
- History is stored on disk at `{workspace}/history/history.json` and persists across sessions.
- On app exit, entries are automatically pruned to a configurable maximum per request (default 10). Change this in **Settings > Request History**.

### Saved Responses

Save any response as a named snapshot for future reference.

- After receiving a response, click **Save Response** in the response panel and give it a name.
- Saved responses appear as nested items under their parent request in the sidebar (expand the request with the ▶ toggle to see them).
- Clicking a saved response loads both the original request and the saved response into the panels in read-only mode.
- Saved responses can be renamed (✏️) or deleted (🗑️) from the sidebar.
- Snapshots are stored in `{workspace}/saved-responses/` and are committed to git.

### Collection Folders

Folders group related requests inside a collection.

- Create folders manually with the **+ Add Folder** button on a collection, or have them created automatically when importing an OpenAPI spec (one folder per tag).
- Click a folder header to expand or collapse it (arrow tip-down = open, tip-right = closed).
- Rename a folder with ✏️ or delete it with 🗑️. Deleting a folder warns you how many requests it contains.
- Requests inside folders support the same rename, delete, and saved-response features as top-level requests.

### Drag and Drop

Reorder and organise requests and folders by dragging items in the sidebar.

- **Reorder requests** within a folder or at the collection root by dragging them up and down.
- **Move requests between folders** by dragging a request onto a different folder.
- **Reorder folders** within a collection by dragging the folder header.

### Request Body Types

The body tab supports several content types:

- **None** - No request body (shows an informational message).
- **Raw** - Free-text body with a format sub-selector:
  - **JSON** (default) - Includes live JSON validation/linting.
  - **Text** - `text/plain`
  - **JavaScript** - `application/javascript`
  - **HTML** - `text/html`
  - **XML** - `application/xml`
- **x-www-form-urlencoded** - Key-value pairs encoded as URL parameters.
- **form-data** - Multipart form data with key-value pairs.
- **Binary** - Upload a file from disk. Click "Select File" to choose, and "Clear" to remove.

The correct `Content-Type` header is set automatically based on your selection.

### Response Syntax Highlighting

JSON and XML responses are colour-coded for readability:

**JSON** - Keys in teal, string values in yellow, numbers in purple, booleans/null in pink, punctuation in grey.

**XML** - Tag names in teal, attribute names in green, attribute values in yellow, text content in white, punctuation in grey.

The format is auto-detected from the response `Content-Type` header, falling back to content inspection.

### Certificate Management

Handle HTTPS certificate warnings and internal APIs with custom CA certificates.

#### When You Need This

- Internal company APIs with self-signed certificates
- Development servers with custom CAs
- Getting certificate errors like "UNABLE_TO_VERIFY_LEAF_SIGNATURE"

#### How to Add Certificates

1. **Open Certificate Manager**: Click "🔒 Certificates" in the top menu bar
2. **Add Certificate**: Click "+ Add Certificate"
3. **Fill Details**:
   - **Name**: Descriptive name (e.g., "Company Internal CA")
   - **Host**: Domain to apply cert to (e.g., "api.company.com" or "*" for all)
   - **Type**: CA Certificate (most common) or Client Certificate
4. **Import Certificate**:
   - Click "Load from File" to import .pem, .crt, .cer files
   - Or paste PEM data directly

#### Certificate Types

**CA Certificate** (most common):
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK2rFVGOLgMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjMwNjE5MTQwNDM5WhcNMjQwNjE4MTQwNDM5WjBF
...
-----END CERTIFICATE-----
```

**Host Matching**:
- `api.company.com` - Specific domain only
- `*.company.com` - All subdomains of company.com
- `*` - Apply to ALL HTTPS requests (not recommended for security)

#### Security Notes

- Certificates are stored locally only (never committed to git)
- Only affects requests from this app
- Use specific hostnames when possible instead of wildcards
- Certificate data is stored in `certificates/` directory

## Git Integration

- All workspaces share a single git repository at the workspaces root directory
- The repo is initialized automatically when the first workspace is created (or skipped if one already exists, e.g. from a clone)
- A `.gitignore` at the workspaces root is automatically maintained to exclude `*.secrets.json`, `*.local.json`, `saved-responses/`, `.DS_Store`, and `node_modules/`
- Collections and environments are saved as JSON files within each workspace subdirectory
- Variables and form parameters marked as secret are automatically split into `.secrets.json` files
- See [Workspaces & Secrets Guide](docs/workspaces-and-secrets.md) for details

## Development

### Building

```bash
npm run build        # Build both React and Electron
npm run dist         # Create distributable packages
```

### Architecture

- **Electron**: Desktop wrapper with file system access
- **React**: Modern UI with TypeScript
- **No Postman dependencies**: Custom HTTP client and script runner
- **Local storage**: Simple JSON files + git

## Roadmap

🚧 **Planned Features:**
- Collection runner (batch/sequential request execution)
- Collection export (Postman v2, OpenAPI)
- Import/export workspaces
- Workspace templates
- Encrypted secrets storage
- Plugin system

## Contributing

This is currently a personal project. Feel free to fork and adapt to your needs.

## License

MIT
