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
- **Form data** - x-www-form-urlencoded and multipart form-data body types
- **Workspace management** - Organize projects into separate workspaces, each with their own git repo
- **Secrets management** - Mark variables and form parameters as secret; secrets are automatically split into `.secrets.json` files and gitignored

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
├── workspaces/               # Workspace projects
│   └── my-project-123456/
│       ├── workspace.json          # Project metadata
│       ├── .git/                   # Per-workspace git repo
│       ├── .gitignore              # Auto-generated (excludes secrets)
│       ├── collections/            # API collections (committed)
│       ├── environments/           # Environment configs (committed)
│       │   ├── dev.json            # Public variables
│       │   └── dev.secrets.json    # Secret variables (gitignored)
│       └── certificates/           # Custom certificates (NOT committed)
├── src/                  # React app source
├── electron/            # Electron main process
└── dist/               # Built files
```

## Usage

### Making API Calls

1. Select an environment from the sidebar
2. Choose a request from a collection
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

### Certificate Management

Handle HTTPS certificate warnings and internal APIs with custom CA certificates.

#### When You Need This

- Internal company APIs with self-signed certificates
- Development servers with custom CAs
- Getting certificate errors like "UNABLE_TO_VERIFY_LEAF_SIGNATURE"

#### How to Add Certificates

1. **Open Certificate Manager**: Click "🔒 Manage Certificates" in the sidebar
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

- Each workspace has its own git repository, initialized automatically on creation
- Collections and environments are saved as JSON files within the workspace
- Variables and form parameters marked as secret are automatically split into `.secrets.json` files
- `.secrets.json` files are gitignored so credentials are never committed
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
- Request history
- Collection runner (batch/sequential request execution)
- File upload support in form-data bodies
- Collection export
- Plugin system

## Contributing

This is currently a personal project. Feel free to fork and adapt to your needs.

## License

MIT