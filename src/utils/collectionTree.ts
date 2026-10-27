import { ApiRequest, Collection, CollectionFolder } from '../types';

/** Anything that can hold requests and nested folders — a Collection or a CollectionFolder. */
export type FolderContainer = { requests: ApiRequest[]; folders?: CollectionFolder[] };

/** Every request in a container, including all nested sub-folders, depth-first. */
export function flattenRequests(container: FolderContainer): ApiRequest[] {
  const result = [...container.requests];
  for (const folder of container.folders || []) {
    result.push(...flattenRequests(folder));
  }
  return result;
}

/** Total request count across a container and all of its nested sub-folders. */
export function countRequests(container: FolderContainer): number {
  return container.requests.length + (container.folders || []).reduce((sum, f) => sum + countRequests(f), 0);
}

/**
 * Folder ids from the outermost folder down to the folder that holds the request.
 * An empty array means the request sits on the container itself.
 * Undefined means the request is not in this container.
 */
export function findRequestFolderPath(container: FolderContainer, requestId: string): string[] | undefined {
  if (container.requests.some(request => request.id === requestId)) return [];
  for (const folder of container.folders || []) {
    const nested = findRequestFolderPath(folder, requestId);
    if (nested) return [folder.id, ...nested];
  }
  return undefined;
}

/** Finds a request by id anywhere in a container, at any depth. */
export function findRequestById(container: FolderContainer, requestId: string): ApiRequest | undefined {
  const direct = container.requests.find(r => r.id === requestId);
  if (direct) return direct;
  for (const folder of container.folders || []) {
    const found = findRequestById(folder, requestId);
    if (found) return found;
  }
  return undefined;
}

/** Finds a folder by id anywhere in a container, at any depth (not including the container itself). */
export function findFolderById(container: FolderContainer, folderId: string): CollectionFolder | undefined {
  for (const folder of container.folders || []) {
    if (folder.id === folderId) return folder;
    const nested = findFolderById(folder, folderId);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Returns a new copy of `container` with every request transformed by `updater`,
 * at any depth. Used for blanket changes like "set auth: inherit on every request".
 */
export function mapAllRequests<T extends FolderContainer>(container: T, updater: (req: ApiRequest) => ApiRequest): T {
  return {
    ...container,
    requests: container.requests.map(updater),
    folders: container.folders?.map(f => mapAllRequests(f, updater)),
  };
}

/** Returns a new copy of `container` with the request matching `requestId` replaced via `updater`, at any depth. */
export function updateRequestById<T extends FolderContainer>(
  container: T,
  requestId: string,
  updater: (req: ApiRequest) => ApiRequest,
): T {
  return {
    ...container,
    requests: container.requests.map(r => (r.id === requestId ? updater(r) : r)),
    folders: container.folders?.map(f => updateRequestById(f, requestId, updater)),
  };
}

/** Returns a new copy of `container` with the request matching `requestId` removed, at any depth. */
export function removeRequestById<T extends FolderContainer>(container: T, requestId: string): T {
  return {
    ...container,
    requests: container.requests.filter(r => r.id !== requestId),
    folders: container.folders?.map(f => removeRequestById(f, requestId)),
  };
}

/**
 * Returns a new copy of `container` with the folder matching `folderId` replaced
 * via `updater`, at any depth (e.g. rename, or append a nested sub-folder/request).
 */
export function updateFolderById<T extends FolderContainer>(
  container: T,
  folderId: string,
  updater: (folder: CollectionFolder) => CollectionFolder,
): T {
  return {
    ...container,
    folders: container.folders?.map(f => (f.id === folderId ? updater(f) : updateFolderById(f, folderId, updater))),
  };
}

export interface FolderOption {
  id: string;
  /** Path from the top-level folder down, e.g. "Users / Admin". */
  label: string;
}

/** Every folder in a container, depth-first, labelled with its full path. */
export function listFolderOptions(container: FolderContainer, parentPath: string[] = []): FolderOption[] {
  const options: FolderOption[] = [];
  for (const folder of container.folders || []) {
    const path = [...parentPath, folder.name];
    options.push({ id: folder.id, label: path.join(' / ') });
    options.push(...listFolderOptions(folder, path));
  }
  return options;
}

/** Returns a new copy of `container` with `content`'s requests and folders appended to the folder `folderId`, or to the root when null. */
export function appendToFolder<T extends FolderContainer>(
  container: T,
  folderId: string | null,
  content: { requests?: ApiRequest[]; folders?: CollectionFolder[] },
): T {
  const requests = content.requests || [];
  const folders = content.folders || [];
  if (folderId === null) {
    return { ...container, requests: [...container.requests, ...requests], folders: [...(container.folders || []), ...folders] };
  }
  return updateFolderById(container, folderId, folder => ({
    ...folder,
    requests: [...folder.requests, ...requests],
    folders: [...(folder.folders || []), ...folders],
  }));
}

let freshIdCounter = 0;

/** Copies requests and folders with new ids at every depth, so merging an import cannot clash with existing ids. */
export function withFreshIds<T extends FolderContainer>(content: T): T {
  const freshId = () => `${Date.now().toString(36)}-${(freshIdCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    ...content,
    requests: content.requests.map(request => ({ ...request, id: freshId() })),
    folders: (content.folders || []).map(folder => withFreshIds({ ...folder, id: freshId() })),
  };
}

/** Returns a new copy of `container` with the folder matching `folderId` removed, at any depth. */
export function removeFolderById<T extends FolderContainer>(container: T, folderId: string): T {
  return {
    ...container,
    folders: container.folders?.filter(f => f.id !== folderId).map(f => removeFolderById(f, folderId)),
  };
}

/** Adds a new folder at the collection root (`parentFolderId === null`) or inside an existing folder at any depth. */
export function addFolder<T extends FolderContainer>(
  container: T,
  parentFolderId: string | null,
  newFolder: CollectionFolder,
): T {
  if (parentFolderId === null) {
    return { ...container, folders: [...(container.folders || []), newFolder] };
  }
  return updateFolderById(container, parentFolderId, f => ({ ...f, folders: [...(f.folders || []), newFolder] }));
}

/** True if `collection` contains a request with this id anywhere, at any depth. */
export function collectionContainsRequest(collection: Collection, requestId: string): boolean {
  return findRequestById(collection, requestId) !== undefined;
}
