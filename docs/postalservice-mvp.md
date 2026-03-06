# PostRebel MVP Requirements (ALL COMPLETED)

Original motivation: Postman changed their licensing, making existing collections inaccessible. Bruno was evaluated and rejected. Goal: build a cross-platform (macOS, Linux, Windows) Postman alternative.

## MVP Checklist

- [x] Git repository support — store files locally in a git-committed repo
- [x] Secrets isolation — environment values in a separate `.secrets.json` file, auto-added to `.gitignore`
- [x] Import Postman V2 JSON files (collections and environments)
- [x] cURL import
- [x] Scriptable with Postman-compatible `pm` object (pre-request and test scripts)
- [x] `{{variable}}` mustache-brace syntax for environment variables
- [x] Customisable headers
- [x] Request bodies: None, Raw (JSON, Text, JavaScript, HTML, XML), x-www-form-urlencoded, form-data, Binary
- [x] All REST methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- [x] Authorization: Basic Auth, JWT Auth, Bearer Token
- [x] Electron + Chromium engine for JavaScript and debug outputs

## Beyond MVP (also completed)

- [x] Workspace management with shared git repo at workspaces root
- [x] Certificate management for internal/self-signed HTTPS APIs
- [x] Secrets management with visual indicators and automatic split/merge
- [x] Per-request execution history with configurable retention
- [x] JSON body linting
- [x] Variable autocomplete
- [x] Configurable workspaces storage directory
- [x] Saved responses — snapshot and name any response; stored in workspace and committed to git
- [x] OpenAPI / Swagger import — accepts OpenAPI 3.0, 3.1 and Swagger 2.0 in JSON or YAML; converts path params, maps security schemes, extracts/generates body examples, groups endpoints by tag into collection folders
- [x] Collection folders — one level of sub-folders within a collection; folders can be added manually, renamed, and deleted (with request-count warning)
- [x] Import moved to top menu bar — accessible for all import types regardless of context
- [x] Drag and drop — reorder requests and folders in the sidebar; drag requests between folders to move them
- [x] Response syntax highlighting — JSON (keys, strings, numbers, booleans) and XML (tags, attributes, values) colour-coded
- [x] Extended body types — Raw sub-types (Text, JavaScript, JSON, HTML, XML), None, and Binary file upload
- [x] Git repo at workspaces root — single shared repo for all workspaces instead of per-workspace repos; `.gitignore` auto-managed
