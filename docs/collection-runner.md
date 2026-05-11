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
| Runner name field | Rename the runner (auto-saves on blur) |
| **▶ Run** | Execute the flow |
| **+ Add Request** | Searchable dropdown — pick any request from the collection |
| **⏱ Delay** | Add a Delay node at the centre of the canvas |
| **↻ For Each** | Add a For Each node at the centre of the canvas |
| **Save** | Persist current state to disk |
| **Revert** | Discard unsaved changes and reload the last saved version |
| **Export** | Download runner as `.runner.json` |
| **Import** | Load a runner from a `.runner.json` file |
| **Log** | Toggle the execution log panel (badge shows entry count) |

### Node types

| Node | Appearance | Purpose |
|------|-----------|---------|
| **Start** | Green circle | Entry point — every run begins here |
| **Request** | Dark card | Executes one API request from the collection |
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
| Teal | Script — `console.log()` output from condition scripts |

You can also call `console.log(...)` inside any condition script and the output appears in the log.

Click **Clear** to empty the log, or **✕** to collapse the panel. The **Log** toolbar button shows a badge with the entry count.

## Start Node — Variable Overrides

Click the **Start** node to set variable overrides that apply for the duration of that run only. These values take precedence over the active environment and are **never written back to it**.

**Use cases:**
- Point `base_url` at a staging server without touching your dev environment
- Pin a specific `user_id` or `account_id` for the test flow
- Inject a known/expired token to test auth failure paths

When overrides are set, the Start node displays a purple badge showing the count.

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

## Delay Node

Click **⏱ Delay** in the toolbar to add a Delay node, then click the node to set the duration in milliseconds. Drop it between any two nodes — the runner waits before continuing.

**Use cases:** rate limiting, waiting for a background job to process before polling.

## For Each Node

Click **↻ For Each** in the toolbar to add a For Each node, then click it to configure:

| Field | Description | Example |
|-------|-------------|---------|
| Array source | A dot-notation path into the last response, or a variable name holding a JSON array | `body.advanceBalance.advances` or `advances` |
| Item variable prefix | Prefix for injected variables | `advance` |

Each item's fields are injected as `{{advance_fieldName}}` (e.g. `{{advance_advancesUuid}}`). The full item JSON is available as `{{advance}}`.

### For Each handles

The For Each node has **two source handles** at the bottom:

| Handle | Position | Purpose |
|--------|---------|---------|
| **body** | Bottom-left | The request(s) to run for each item |
| **done** | Bottom-right | Where to continue after all items complete |

Connect **body** to the per-item request node(s), and **done** to wherever the flow should go after the loop finishes.

## Saving and Reverting

- Click **Save** or blur the runner name to persist all changes.
- Click **Revert** to discard any unsaved changes and restore the last saved version. A confirmation is shown before reverting.
- Runner state (nodes, edges, positions, conditions, mappings, outputs) is stored in `{workspace}/runners/` and committed to git.

## Export / Import

- **Export** — Downloads the runner as a `.runner.json` file for sharing or backup.
- **Import** — Opens a file picker; loads nodes, edges, conditions, and mappings from a previously exported file. The current canvas is replaced.

## Typical Auth Flow Example

1. Add three requests to your collection: `Login`, `Get Profile`, `Handle Error`.
2. Create a runner and add all three as nodes.
3. Connect: `Start → Login → [branch]`
4. On the edge `Login → Get Profile`:
   - **Condition**: `return status === 200;`
   - **Mappings**: `body.access_token` → `access_token`
   - **Output**: `body.description`
5. On the edge `Login → Handle Error`:
   - Condition: leave blank (the *else* path)
6. Connect both branches to `End`.
7. On `Get Profile`, set Auth → Bearer Token: `{{access_token}}`
8. Click **▶ Run**

After running, check the execution log for the output value, then click any node to inspect its full request and response.

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
