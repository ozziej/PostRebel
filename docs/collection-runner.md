# Collection Runner

The Collection Runner lets you chain multiple requests together into a visual flow diagram, pass data between them, branch on conditions, and execute the whole sequence in one click.

## Overview

A Runner belongs to a collection and is displayed in the sidebar beneath it with a purple **RUNNER** badge. Each workspace can have any number of runners. Runner files are stored at `{workspace}/runners/<id>.json` and are committed to git alongside collections and environments.

## Creating a Runner

1. Click the **+** button on any collection header in the sidebar.
2. Select **New Runner** from the dropdown (the same button also offers **New Request**).
3. The runner appears in the sidebar under its collection.
4. Click it to open the canvas.

## The Canvas

The canvas opens inside the request panel area, replacing the normal request editor. It contains:

- **Toolbar** at the top: runner name field, Run button, Add Request, Save, Export, Import.
- **Flow area**: nodes and edges you arrange visually.
- **Inline response panel**: slides in on the right when you click a completed node.

### Node types

| Node | Appearance | Purpose |
|------|-----------|---------|
| **Start** | Green circle | Entry point — every run begins here |
| **Request** | Dark card | Executes one API request from the collection |
| **End** | Red circle | Marks the end of a path (optional but recommended) |

### Connecting nodes

Drag from the **bottom handle** of any node to the **top handle** of the next node to create an edge. You can draw multiple edges out of one node to create branches.

## Running

Click **▶ Run** in the toolbar. Each node updates in real time:

| Badge | Meaning |
|-------|---------|
| Amber `…` | Currently executing |
| Green `✓` | Completed — 2xx status |
| Red `✗` | Failed — 4xx / 5xx / network error |

The run follows the connected path from Start to End (or until no matching edge is found).

## Viewing Node Responses

Click any node that has finished executing (success **or** failure) to open the inline response panel. The panel shows:

- **Status code and text** in the header bar
- **Timing and size** stats
- **Body tab** — full response body, JSON objects pretty-printed
- **Headers tab** — all response headers

Click a different node to switch to its response. Click the `✕` to close the panel. Both the canvas and the panel are visible at the same time so you can inspect multiple results without losing your view of the flow.

## Passing Data Between Requests

Click any **edge** (arrow) to open the **Edge Settings** dialog.

### Data Mappings tab

Extract a value from the source node's response and save it as a `{{variable}}` for downstream requests.

| Field | Description | Example |
|-------|-------------|---------|
| From response | Dot-notation path into the response | `body.access_token` |
| Save as variable | Variable name (no braces needed) | `access_token` |

The variable is then available as `{{access_token}}` in any downstream request URL, header, auth field, or body.

#### Supported expressions

| Expression | What it extracts |
|-----------|-----------------|
| `body.fieldName` | JSON field from the response body |
| `body.nested.field` | Deeply nested JSON field |
| `status` | HTTP status code as a string (e.g. `"200"`) |
| `statusText` | HTTP status text (e.g. `"OK"`) |
| `headers.content-type` | Response header value (case-insensitive) |

Mappings are only applied when the edge they are on is actually followed (relevant for conditional branching).

## Conditional Branching

Click an edge and open the **Condition (if)** tab to add a JavaScript condition. The script must `return true` to follow the edge or `return false` to skip it. Leave blank for an unconditional edge.

### Execution order

When a request node has multiple outgoing edges:

1. **Conditional edges are evaluated first** (in the order they were drawn).
2. The **first edge whose condition returns `true`** is followed.
3. If no conditional edge matches, the **first unconditional edge** (blank condition) is followed as the *else* / default path.
4. If nothing matches, the run stops at that node.

This lets you build `if / else if / else` chains using multiple edges out of one node.

### Available identifiers

| Name | Type | Description |
|------|------|-------------|
| `status` | `number` | HTTP status code, e.g. `200` |
| `body` | `any` | Parsed response body (JSON object, or string for non-JSON) |
| `headers` | `object` | Response headers |
| `variables` | `object` | Current environment variables (including any mapped values) |
| `response` | `object` | Full response: `{ status, statusText, body, headers }` |

### Examples

```javascript
// Success path
return status === 200;

// Check a JSON field
return body.success === true;

// Ensure a token was returned
return body.access_token !== undefined;

// Any 2xx
return status >= 200 && status < 300;

// Use a previously mapped variable
return variables.retry_count < 3;

// Check an array has results
return Array.isArray(body.items) && body.items.length > 0;
```

### Edge colour legend

| Colour | Meaning |
|--------|---------|
| Teal solid | Unconditional (no condition set) |
| Amber dashed | Conditional — not yet run |
| Green solid | Followed during the last run |
| Dimmed / grey | Skipped (condition returned false, or run didn't reach it) |

## Typical Auth Flow Example

A common pattern: authenticate first, extract the token, then use it in subsequent requests.

**Setup:**

1. Add three requests to your collection: `Login`, `Get Profile`, `Handle Error`.
2. Create a runner and add all three as nodes.
3. Connect: `Start → Login → [branch] → End`
4. On the edge `Login → Get Profile`:
   - **Condition**: `return status === 200;`
   - **Mapping**: `body.access_token` → `access_token`
5. On the edge `Login → Handle Error`:
   - **Condition**: leave blank (unconditional / else)
6. On `Get Profile`, set Auth → Bearer Token: `{{access_token}}`
7. Click **▶ Run**

After running, click the `Login` node to see the auth response and confirm the token was present, then click `Get Profile` to see its response.

## Saving

- Click **Save** in the toolbar, or edit the runner name field and press Tab/click away.
- Runner state (nodes, edges, conditions, mappings, positions) is persisted immediately.
- Runner files are committed to git as part of the workspace.

## Export / Import

- **Export** — Downloads the runner as a `.runner.json` file. Useful for sharing or backup.
- **Import** — Opens a file picker; loads nodes, edges, conditions, and mappings from a previously exported file. The current canvas is replaced.

## Storage

Runners are stored at:

```
{workspaces}/
└── {workspace-id}/
    └── runners/
        └── {runner-id}.json
```

Each file is a self-contained JSON object with `nodes`, `edges`, `name`, `collectionId`, and timestamps. Runner files are committed to git (not gitignored).

## Limitations (current)

- **Linear / branching flows only** — no loops or parallel execution.
- **One collection per runner** — all request nodes must come from the runner's parent collection.
- **No retry logic** — use condition edges to route to a retry node manually if needed.
