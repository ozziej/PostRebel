# Collection Runner

The Collection Runner lets you chain multiple requests together into a visual flow diagram, pass data between them, branch on conditions, iterate over arrays, insert delays, and execute the whole sequence in one click.

## Overview

A Runner belongs to a collection and is displayed in the sidebar beneath it with a purple **RUNNER** badge. Each workspace can have any number of runners. Runner files are stored at `{workspace}/runners/<id>.json` and are committed to git alongside collections and environments.

## Creating a Runner

1. Click the **+** button on any collection header in the sidebar.
2. Select **New Runner** from the dropdown (the same button also offers **New Request**).
3. The runner appears in the sidebar under its collection.
4. Click it to open the canvas.

## The Canvas

The canvas fills the full panel area when a runner is active. It contains:

- **Toolbar** at the top (see below).
- **Flow area** — nodes and edges you arrange visually.
- **Inline request / response panel** — slides in on the right when you click a completed node.
- **Execution log panel** — collapsible strip at the bottom, auto-opens on Run.

### Toolbar

| Button | Purpose |
|--------|---------|
| Runner name | Display only — rename via the sidebar **···** menu |
| **▶ Run** | Execute the flow |
| **⏹ Stop** | Abort a run in progress — appears next to **Running…** while executing |
| **+ Add Request** | Searchable dropdown — pick any request from the collection |
| **+ Nodes ▾** | Dropdown to add a **Debug Script**, **Delay**, or **For Each** node |
| **Save** | Persist current state to disk |
| **Revert** | Discard unsaved changes and reload the last saved version |
| **Export** | Download runner as `.runner.json` |
| **Import** | Load a runner from a `.runner.json` file |
| **Log** | Toggle the execution log panel (badge shows entry count) |

### Node types

| Node | Appearance | Purpose |
|------|-----------|---------|
| **Start** | Green circle | Entry point — every run begins here; click to set variable overrides |
| **Request** | Dark card | Executes one API request from the collection |
| **Debug** | Blue-grey card | Runs a JavaScript snippet for inspection; always a pass-through |
| **Delay** | Amber card | Pauses execution for a configurable number of milliseconds |
| **For Each** | Indigo card | Iterates over an array, running a sub-sequence per item |
| **End** | Red circle | Marks the end of a path |

### Connecting nodes

Drag from the **bottom handle** of any node to the **top handle** of the next node to create an edge. You can draw multiple edges out of one node to create branches.

To **reconnect** an existing edge, drag either endpoint (source or target) to a new node. This preserves any condition, mappings, and output already configured on the edge.

### Deleting nodes

Hover over any node (except Start) to reveal a red **✕** button in the top-right corner. Clicking it shows a confirmation prompt and then removes the node together with all its connected edges.

## Running

Click **▶ Run** in the toolbar. Each node updates in real time:

| Badge | Meaning |
|-------|---------|
| Amber `…` | Currently executing |
| Green `✓` | Completed — 2xx status |
| Red `✗` | Failed — 4xx / 5xx / network error |

The run follows the connected path from Start to End (or until no matching edge is found).

### Stopping a run

Click **⏹ Stop** (red button, visible while running) to abort immediately. The runner stops at the next node boundary — any in-flight HTTP request for the current node completes first, then execution halts. A `⏹ Run stopped by user` entry appears in the execution log.

## Viewing Node Requests and Responses

Click any completed node (success **or** failure) to open the inline panel on the right. The panel is split into two sections separated by a labelled divider:

**Request (top)**
- Method badge and resolved URL (with `{{variables}}` substituted to their actual values)
- **Headers** and **Body** tabs showing exactly what was sent

**Response (bottom)**
- Status code, timing, and size
- **Headers** and **Body** tabs

Click a different node to switch the panel to that node's data. Click **✕** to close.

## Execution Log

The execution log panel opens automatically when you click **▶ Run**. It records every step:

| Colour | Meaning |
|--------|---------|
| Grey | Info — node started, for-each item progress |
| Green | Success — node completed, condition followed, output value |
| Amber | Warn — 4xx response |
| Red | Error — node failed, condition script error |
| Teal | Script — `console.log()` and `pm.test()` output from pre-request scripts, test scripts, condition scripts, and debug nodes |

Each entry is prefixed with an elapsed time (e.g. `+0.387s`) measured from when **▶ Run** was clicked, making it easy to identify slow nodes.

You can call `console.log(...)` inside any script or condition and the output appears in the log as a teal entry.

Click **Download** to save the current log as a CSV file (`elapsed_s`, `level`, `message` columns). Click **Clear** to empty the log, or **✕** to collapse the panel. The **Log** toolbar button shows a badge with the entry count.

## Start Node — Variable Overrides

Click the **Start** node to set variable overrides that apply for the duration of that run only. These values take precedence over the active environment and are **never written back to it**.

**Use cases:**
- Point `base_url` at a staging server without touching your dev environment
- Pin a specific `user_id` or `account_id` for the test flow
- Inject a known/expired token to test auth failure paths

When overrides are set, the Start node displays a purple badge showing the count.

## Request Scripts in the Runner

If a request in your collection has a **pre-request script** or **test script** configured (in the Scripts tab of the request panel), the runner executes them automatically — no extra configuration needed.

### Execution order for each Request node

1. **Pre-request script** runs first. Any `pm.environment.set()` calls update the variable state before the HTTP request is built, so substituted URLs, headers, and bodies see the new values.
2. **HTTP request** executes with the updated variables.
3. **Test script** runs against the response. Any `pm.environment.set()` calls are immediately available to all subsequent nodes in the flow.

### Script output in the log

All `console.log()`, `console.warn()`, and `console.error()` calls appear as teal entries in the execution log. `pm.test()` pass/fail results are also shown:

```
✓ Status is 200
✗ Token present: Expected undefined to equal string
```

### Using test scripts to pass data downstream

A test script that sets a variable is the simplest way to chain authenticated requests:

```javascript
// Test script on "Get Token" request node
if (pm.response.to.have.status(200)) {
    const data = pm.response.json();
    pm.environment.set("access_token", data.access_token);
}
```

After this node completes, `{{access_token}}` is available in every downstream node's URL, headers, auth fields, and body — without needing an edge mapping.

> **Note:** Edge mappings and test scripts can coexist. Use whichever fits your flow — test scripts are better when the extraction logic already exists in the request definition; edge mappings are better for one-off extractions specific to the runner flow.

### Legacy `responseBody` variable

Scripts that reference `responseBody` (a legacy Postman variable removed in Postman v2) will display a warning in the execution log and the variable will be `undefined`. Replace it with `pm.response.text()` or `pm.response.json()`.

## Passing Data Between Requests (Mappings)

Click any **edge** to open **Edge Settings**, then go to the **Data Mappings** tab.

| Field | Description | Example |
|-------|-------------|---------|
| From response | Dot-notation path into the response | `body.access_token` |
| Save as variable | Variable name (no braces needed) | `access_token` |

The variable is then available as `{{access_token}}` in any downstream request URL, header, auth field, or body.

#### Supported path expressions

| Expression | What it extracts |
|-----------|-----------------|
| `body.fieldName` | Top-level JSON field |
| `body.nested.field` | Deeply nested JSON field |
| `body.items[0].id` | First element of an array, then a field |
| `body.results[2].name` | Third element of an array |
| `body.data.items[0].itemUuid` | Nested array with field access |
| `status` | HTTP status code as a string (e.g. `"200"`) |
| `statusText` | HTTP status text (e.g. `"OK"`) |
| `headers.content-type` | Response header value (case-insensitive) |

Mappings are only applied when the edge they are on is actually followed.

## Conditional Branching

Click an edge and open the **Condition (if)** tab. Write JavaScript that returns `true` to follow this edge or `false` to skip it. Leave blank for an unconditional edge (always followed — acts as the *else* path).

#### Execution order

When a node has multiple outgoing edges:

1. **Conditional edges are evaluated first** (in draw order).
2. The **first edge whose condition returns `true`** is followed.
3. If no conditional edge matches, the **first unconditional edge** is followed as the *else* fallback.
4. If nothing matches, the run stops at that node.

#### Available identifiers

| Name | Type | Description |
|------|------|-------------|
| `status` | `number` | HTTP status code, e.g. `200` |
| `body` | `any` | Parsed response body (JSON object, or string for non-JSON) |
| `headers` | `object` | Response headers |
| `variables` | `object` | Current environment variables (including mapped values) |
| `response` | `object` | Full response: `{ status, statusText, body, headers }` |

#### Examples

```javascript
return status === 200;
return body.success === true;
return body.access_token !== undefined;
return status >= 200 && status < 300;
return variables.retry_count < 3;
return Array.isArray(body.items) && body.items.length > 0;

// console.log is available and appears in the execution log
console.log('token:', body.access_token);
return !!body.access_token;
```

#### Edge colour legend

| Colour | Meaning |
|--------|---------|
| Teal solid | Unconditional (no condition set) |
| Amber dashed | Conditional — not yet run |
| Green solid | Followed during the last run |
| Dimmed / grey | Skipped (condition returned false, or run didn't reach it) |

## Edge Output

Click an edge and open the **Output** tab to log a value when that edge is followed. Useful on edges that lead to the End node to surface a final result.

```
body.description        → logs the description field from the last response
{{access_token}}        → logs the value of a mapped variable
status                  → logs the HTTP status code
```

The value appears in the execution log as a green `▶ expression: value` entry.

## Debug Node

Click **+ Nodes ▾ → Debug Script** to add a Debug node. Click the node to open a JavaScript editor. The script runs when the runner reaches that node, logs all `console.log()` output to the execution log in teal, then **always continues** to the next connected node — it never stops the flow.

```javascript
// Inspect what For Each injected for this item:
console.log('item:', variables.item);          // full object
console.log('userId:', variables.item.userId); // dot notation — direct property access
console.log('id:', variables.item.id);

// Check the last HTTP response:
console.log('status:', status);
console.log('body:', body);

// Dump all current variables:
console.log('all vars:', variables);
```

**Available identifiers** (same as condition scripts):

| Name | Value |
|------|-------|
| `body` | Last response body (parsed JSON or string) |
| `status` | Last HTTP status code |
| `headers` | Last response headers |
| `variables` | All current variables — For Each items are pre-parsed objects, so dot access works |
| `response` | Full response object |
| `console` | `log`, `warn`, `error` — all captured to the execution log |

The node is always a pass-through. Even if the script throws an error, the flow continues and the error is logged in red.

## Delay Node

Click **+ Nodes ▾ → Delay** to add a Delay node, then click the node to set the duration in milliseconds. Drop it between any two nodes — the runner waits before continuing.

**Use cases:** rate limiting, waiting for a background job to process before polling.

## For Each Node

Click **+ Nodes ▾ → For Each** in the toolbar to add a For Each node, then click it to configure:

| Field | Description | Example |
|-------|-------------|---------|
| Array source | Path to the array in the last response, or a variable name holding a JSON array | see below |
| Item variable prefix | Prefix for injected variables | `item` |

#### Array source expressions

| Expression | When to use |
|-----------|-------------|
| `body` | The response body **is** the array (e.g. `[ {...}, {...} ]`) |
| `body.items` | The array is at `response.body.items` |
| `body.data.userId` | Nested path |
| `items` | A variable mapped from a previous edge containing a JSON array |

#### Item variables

For each object in the array, two kinds of variables are injected with the configured prefix (e.g. `item`):

| Variable | Value |
|----------|-------|
| `{{item}}` | Full item as a JSON string |
| `{{item.fieldName}}` | Field value using **dot notation** (e.g. `{{item.userId}}`) |
| `{{item_fieldName}}` | Same value using **underscore notation** (e.g. `{{item_userId}}`) — both work |

Both notations are valid in request URLs, headers, auth fields, and bodies.

Inside **condition scripts** and **debug scripts**, the variables object is pre-parsed, so you can also use direct JavaScript dot access:
```javascript
console.log(variables.item.userId);   // works — item is a parsed object
console.log(variables.item_userId);    // also works — flat string value
```

### For Each handles

The For Each node has **two source handles** at the bottom:

| Handle | Position | Purpose |
|--------|---------|---------|
| **body** | Bottom-left | The request(s) to run for each item |
| **done** | Bottom-right | Where to continue after all items complete |

Connect **body** to the per-item request node(s), and **done** to wherever the flow should go after the loop finishes.

## Saving and Reverting

- Click **Save** to persist all changes. To rename a runner, use the **···** menu on the runner item in the sidebar.
- Click **Revert** to discard any unsaved changes and restore the last saved version. A confirmation is shown before reverting.
- Runner state (nodes, edges, positions, conditions, mappings, outputs) is stored in `{workspace}/runners/` and committed to git.

## Export / Import

- **Export** — Downloads the runner as a `.runner.json` file for sharing or backup.
- **Import** — Opens a file picker; loads nodes, edges, conditions, and mappings from a previously exported file. The current canvas is replaced.

## Typical Auth Flow Example

### Using a test script (recommended)

1. Add three requests to your collection: `Login`, `Get Profile`, `Handle Error`.
2. On the `Login` request, add a **test script**:
   ```javascript
   if (pm.response.to.have.status(200)) {
       pm.environment.set("access_token", pm.response.json().access_token);
   }
   ```
3. On `Get Profile`, set Auth → Bearer Token: `{{access_token}}`.
4. Create a runner and add all three as nodes.
5. Connect: `Start → Login → [branch]`
6. On the edge `Login → Get Profile`: add a **Condition** `return status === 200;`
7. On the edge `Login → Handle Error`: leave condition blank (the *else* path).
8. Connect both branches to `End`.
9. Click **▶ Run**.

When `Login` succeeds, the test script sets `access_token` automatically. `Get Profile` picks it up from `{{access_token}}` without any edge mapping required.

### Using an edge mapping (alternative)

If you prefer to keep the extraction in the runner rather than the request definition, skip the test script and instead configure the `Login → Get Profile` edge:

- **Condition**: `return status === 200;`
- **Data Mappings**: `body.access_token` → `access_token`
- **Output**: `body.description`

Both approaches produce the same result — choose whichever fits your workflow.

After running, check the execution log for script output and mapped values, then click any node to inspect its full request and response.

## Storage

```
{workspaces}/
└── {workspace-id}/
    └── runners/
        └── {runner-id}.json
```

Each file is a self-contained JSON object with `nodes`, `edges`, `name`, `collectionId`, and timestamps. Runner files are committed to git (not gitignored).

## Limitations

- **Branching flows only** — no loop-back edges or parallel execution.
- **One collection per runner** — all request nodes must come from the runner's parent collection.
