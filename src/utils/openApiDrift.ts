import { ApiRequest, Collection, CollectionFolder } from '../types';

// Compares a freshly re-imported OpenAPI collection against the collection it
// would be merged into, so re-importing a spec after the API changed shows
// what's actually different instead of blindly duplicating everything.
//
// Endpoints are matched across the two collections by method + URL pathname
// (ignoring host/scheme, since a spec's `servers` entry can change without
// the endpoint itself changing) — not by request id, which only exists after
// the first import, and not by name, which can be edited by hand.

export interface DriftChange {
  field: string;
  before: string;
  after: string;
}

export interface DriftEntry {
  key: string;
  method: string;
  path: string;
  name: string;
  tag: string | null;
  existingRequestId?: string;
  importedRequest?: ApiRequest;
  changes?: DriftChange[];
}

export interface OpenApiDriftResult {
  added: DriftEntry[];
  removed: DriftEntry[];
  changed: DriftEntry[];
  unchangedCount: number;
}

interface TaggedRequest {
  request: ApiRequest;
  tag: string | null;
}

function flattenTagged(collection: Collection): TaggedRequest[] {
  const result: TaggedRequest[] = collection.requests.map(request => ({ request, tag: null }));
  for (const folder of collection.folders || []) {
    for (const request of folder.requests) {
      result.push({ request, tag: folder.name });
    }
  }
  return result;
}

export function extractPathname(url: string): string {
  const withoutQuery = url.split('?')[0];
  try {
    // URL() percent-encodes {{ }} (not valid path chars per the URL spec);
    // decode back so matching keys and displayed paths read naturally.
    return decodeURIComponent(new URL(withoutQuery).pathname);
  } catch {
    return withoutQuery;
  }
}

function extractQueryKeys(url: string): string[] {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return [];
  return url.slice(qIndex + 1)
    .split('&')
    .map(part => part.split('=')[0])
    .filter(Boolean)
    .sort();
}

interface Signature {
  authType: string;
  contentType: string | null;
  hasBody: boolean;
  headers: string[];
  query: string[];
}

function computeSignature(request: ApiRequest): Signature {
  const headers = Object.keys(request.headers || {}).filter(h => h !== 'Content-Type').sort();
  return {
    authType: request.auth?.type || 'none',
    contentType: request.headers?.['Content-Type'] || null,
    hasBody: !!request.body && request.body.type !== 'none',
    headers,
    query: extractQueryKeys(request.url),
  };
}

function diffSignatures(before: Signature, after: Signature): DriftChange[] {
  const changes: DriftChange[] = [];
  if (before.authType !== after.authType) {
    changes.push({ field: 'auth', before: before.authType, after: after.authType });
  }
  if (before.contentType !== after.contentType) {
    changes.push({ field: 'content-type', before: before.contentType || '(none)', after: after.contentType || '(none)' });
  }
  if (before.hasBody !== after.hasBody) {
    changes.push({ field: 'body', before: before.hasBody ? 'present' : 'none', after: after.hasBody ? 'present' : 'none' });
  }
  if (before.headers.join(',') !== after.headers.join(',')) {
    changes.push({ field: 'headers', before: before.headers.join(', ') || '(none)', after: after.headers.join(', ') || '(none)' });
  }
  if (before.query.join(',') !== after.query.join(',')) {
    changes.push({ field: 'query params', before: before.query.join(', ') || '(none)', after: after.query.join(', ') || '(none)' });
  }
  return changes;
}

function matchKey(request: ApiRequest): string {
  return `${request.method} ${extractPathname(request.url)}`;
}

export function computeOpenApiDrift(existing: Collection, imported: Collection): OpenApiDriftResult {
  const existingByKey = new Map<string, TaggedRequest>();
  for (const entry of flattenTagged(existing)) {
    existingByKey.set(matchKey(entry.request), entry);
  }

  const importedByKey = new Map<string, TaggedRequest>();
  for (const entry of flattenTagged(imported)) {
    importedByKey.set(matchKey(entry.request), entry);
  }

  const added: DriftEntry[] = [];
  const changed: DriftEntry[] = [];
  let unchangedCount = 0;

  for (const [key, { request, tag }] of importedByKey) {
    const existingEntry = existingByKey.get(key);
    const path = extractPathname(request.url);

    if (!existingEntry) {
      added.push({ key, method: request.method, path, name: request.name, tag, importedRequest: request });
      continue;
    }

    const changes = diffSignatures(computeSignature(existingEntry.request), computeSignature(request));
    if (tag !== existingEntry.tag) {
      changes.push({ field: 'folder', before: existingEntry.tag || '(root)', after: tag || '(root)' });
    }

    if (changes.length > 0) {
      changed.push({
        key, method: request.method, path, name: request.name, tag,
        existingRequestId: existingEntry.request.id,
        importedRequest: request,
        changes,
      });
    } else {
      unchangedCount++;
    }
  }

  const removed: DriftEntry[] = [];
  for (const [key, { request, tag }] of existingByKey) {
    if (!importedByKey.has(key)) {
      removed.push({
        key, method: request.method, path: extractPathname(request.url), name: request.name, tag,
        existingRequestId: request.id,
      });
    }
  }

  return { added, removed, changed, unchangedCount };
}

let _idCounter = 0;
function generateId(): string {
  return `${Date.now()}-${++_idCounter}-${Math.random().toString(36).substr(2, 5)}`;
}

function getOrCreateFolder(collection: Collection, tag: string): CollectionFolder {
  collection.folders = collection.folders || [];
  let folder = collection.folders.find(f => f.name === tag);
  if (!folder) {
    folder = { id: generateId(), name: tag, requests: [] };
    collection.folders.push(folder);
  }
  return folder;
}

function removeRequestFromCollection(collection: Collection, requestId: string): void {
  collection.requests = collection.requests.filter(r => r.id !== requestId);
  for (const folder of collection.folders || []) {
    folder.requests = folder.requests.filter(r => r.id !== requestId);
  }
}

function placeRequest(collection: Collection, request: ApiRequest, tag: string | null): void {
  if (tag === null) {
    collection.requests.push(request);
  } else {
    getOrCreateFolder(collection, tag).requests.push(request);
  }
}

// Applies a previously computed drift onto `existing`, returning a new
// Collection. Matched (changed) requests keep their original id, so runner
// flows, saved responses, and history that reference them stay valid.
// `removeKeys` opts specific `removed` entries into actual deletion — anything
// not listed there is left alone, so re-importing never silently deletes data.
export function applyOpenApiDrift(
  existing: Collection,
  drift: OpenApiDriftResult,
  removeKeys: Set<string> = new Set(),
): Collection {
  const result: Collection = JSON.parse(JSON.stringify(existing));

  for (const entry of drift.changed) {
    if (!entry.importedRequest || !entry.existingRequestId) continue;
    removeRequestFromCollection(result, entry.existingRequestId);
    placeRequest(result, { ...entry.importedRequest, id: entry.existingRequestId }, entry.tag);
  }

  for (const entry of drift.added) {
    if (!entry.importedRequest) continue;
    placeRequest(result, entry.importedRequest, entry.tag);
  }

  for (const entry of drift.removed) {
    if (entry.existingRequestId && removeKeys.has(entry.key)) {
      removeRequestFromCollection(result, entry.existingRequestId);
    }
  }

  return result;
}
