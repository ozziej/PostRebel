import { describe, it, expect } from 'vitest';
import {
  flattenRequests,
  countRequests,
  findRequestById,
  findFolderById,
  mapAllRequests,
  updateRequestById,
  removeRequestById,
  updateFolderById,
  removeFolderById,
  addFolder,
  collectionContainsRequest,
} from '../../utils/collectionTree';
import { ApiRequest, Collection, CollectionFolder } from '../../types';

function req(id: string): ApiRequest {
  return { id, name: id, method: 'GET', url: 'https://example.com', headers: {} };
}

// Collection root
//   requests: [r1]
//   folders:
//     A (requests: [r2])
//       folders:
//         B (requests: [r3, r4])
function makeNestedCollection(): Collection {
  const folderB: CollectionFolder = { id: 'B', name: 'B', requests: [req('r3'), req('r4')] };
  const folderA: CollectionFolder = { id: 'A', name: 'A', requests: [req('r2')], folders: [folderB] };
  return { id: 'c1', name: 'Coll', requests: [req('r1')], folders: [folderA] };
}

describe('flattenRequests', () => {
  it('collects requests at every depth, depth-first', () => {
    const collection = makeNestedCollection();
    expect(flattenRequests(collection).map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('countRequests', () => {
  it('counts requests across all nesting levels', () => {
    expect(countRequests(makeNestedCollection())).toBe(4);
  });

  it('counts zero for an empty container', () => {
    expect(countRequests({ requests: [] })).toBe(0);
  });
});

describe('findRequestById', () => {
  it('finds a request at the root', () => {
    expect(findRequestById(makeNestedCollection(), 'r1')?.id).toBe('r1');
  });

  it('finds a request nested two folders deep', () => {
    expect(findRequestById(makeNestedCollection(), 'r4')?.id).toBe('r4');
  });

  it('returns undefined for a missing request', () => {
    expect(findRequestById(makeNestedCollection(), 'missing')).toBeUndefined();
  });
});

describe('collectionContainsRequest', () => {
  it('is true for a request nested at any depth, false otherwise', () => {
    const collection = makeNestedCollection();
    expect(collectionContainsRequest(collection, 'r3')).toBe(true);
    expect(collectionContainsRequest(collection, 'missing')).toBe(false);
  });
});

describe('findFolderById', () => {
  it('finds a top-level folder', () => {
    expect(findFolderById(makeNestedCollection(), 'A')?.id).toBe('A');
  });

  it('finds a folder nested inside another folder', () => {
    expect(findFolderById(makeNestedCollection(), 'B')?.id).toBe('B');
  });

  it('returns undefined for a missing folder', () => {
    expect(findFolderById(makeNestedCollection(), 'missing')).toBeUndefined();
  });
});

describe('mapAllRequests', () => {
  it('transforms every request at every depth', () => {
    const collection = makeNestedCollection();
    const updated = mapAllRequests(collection, r => ({ ...r, name: `${r.name}-tagged` }));
    expect(flattenRequests(updated).map(r => r.name)).toEqual(['r1-tagged', 'r2-tagged', 'r3-tagged', 'r4-tagged']);
    // original untouched
    expect(flattenRequests(collection).map(r => r.name)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('updateRequestById', () => {
  it('replaces a request nested two folders deep, leaving everything else untouched', () => {
    const collection = makeNestedCollection();
    const updated = updateRequestById(collection, 'r4', r => ({ ...r, name: 'renamed' }));
    expect(findRequestById(updated, 'r4')?.name).toBe('renamed');
    expect(findRequestById(updated, 'r3')?.name).toBe('r3');
    expect(findRequestById(updated, 'r1')?.name).toBe('r1');
  });
});

describe('removeRequestById', () => {
  it('removes a request nested two folders deep', () => {
    const collection = makeNestedCollection();
    const updated = removeRequestById(collection, 'r4');
    expect(flattenRequests(updated).map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('is a no-op when the request does not exist', () => {
    const collection = makeNestedCollection();
    const updated = removeRequestById(collection, 'missing');
    expect(flattenRequests(updated).map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('updateFolderById', () => {
  it('renames a folder nested inside another folder', () => {
    const collection = makeNestedCollection();
    const updated = updateFolderById(collection, 'B', f => ({ ...f, name: 'B renamed' }));
    expect(findFolderById(updated, 'B')?.name).toBe('B renamed');
    expect(findFolderById(updated, 'A')?.name).toBe('A');
  });
});

describe('removeFolderById', () => {
  it('removes a top-level folder along with everything nested inside it', () => {
    const collection = makeNestedCollection();
    const updated = removeFolderById(collection, 'A');
    expect(updated.folders).toEqual([]);
    expect(flattenRequests(updated).map(r => r.id)).toEqual(['r1']);
  });

  it('removes a nested folder without disturbing its parent or siblings', () => {
    const collection = makeNestedCollection();
    const updated = removeFolderById(collection, 'B');
    const folderA = findFolderById(updated, 'A');
    expect(folderA?.folders).toEqual([]);
    expect(flattenRequests(updated).map(r => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('addFolder', () => {
  it('adds a folder at the collection root when parentFolderId is null', () => {
    const collection = makeNestedCollection();
    const updated = addFolder(collection, null, { id: 'C', name: 'C', requests: [] });
    expect(updated.folders?.map(f => f.id)).toEqual(['A', 'C']);
  });

  it('adds a sub-folder inside an existing folder at any depth', () => {
    const collection = makeNestedCollection();
    const updated = addFolder(collection, 'B', { id: 'D', name: 'D', requests: [] });
    const folderB = findFolderById(updated, 'B');
    expect(folderB?.folders?.map(f => f.id)).toEqual(['D']);
    // sibling folder A is untouched
    expect(findFolderById(updated, 'A')?.folders?.map(f => f.id)).toEqual(['B']);
  });
});
