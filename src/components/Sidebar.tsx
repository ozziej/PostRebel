import React, { useState } from 'react';
import { Collection, Environment, ApiRequest, Workspace, SavedResponse, CollectionFolder } from '../types';

interface SidebarProps {
  activeWorkspace: Workspace | null;
  collections: Collection[];
  savedResponses: SavedResponse[];
  activeSavedResponse: SavedResponse | null;
  onSelectRequest: (request: ApiRequest) => void;
  onSelectSavedResponse: (saved: SavedResponse) => void;
  onDeleteSavedResponse: (id: string) => void;
  onRenameSavedResponse: (id: string, newName: string) => void;
  onSaveCollection: (collection: Collection) => Promise<any>;
  onDeleteCollection: (collectionId: string) => Promise<any>;
  onDeleteRequest: (collectionId: string, requestId: string) => Promise<any>;
  onEditCollectionAuth: (collection: Collection) => void;
}

interface DragItem {
  type: 'request' | 'folder';
  id: string;
  sourceCollectionId: string;
  sourceFolderId: string | null;
}

interface DropIndicator {
  collectionId: string;
  folderId: string | null;
  insertIndex: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeWorkspace,
  collections,
  savedResponses,
  activeSavedResponse,
  onSelectRequest,
  onSelectSavedResponse,
  onDeleteSavedResponse,
  onRenameSavedResponse,
  onSaveCollection,
  onDeleteCollection,
  onDeleteRequest,
  onEditCollectionAuth,
}) => {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newFolderCollectionId, setNewFolderCollectionId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingSavedResponse, setEditingSavedResponse] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Drag and drop state
  // dragItemRef is set synchronously so handlers can read it immediately.
  // dragItem (state) is deferred so the DOM doesn't shift during drag init.
  const dragItemRef = React.useRef<DragItem | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [dropFolderHighlight, setDropFolderHighlight] = useState<string | null>(null);

  const toggleFolder = (folderId: string) => {
    const expanded = new Set(expandedFolders);
    if (expanded.has(folderId)) {
      expanded.delete(folderId);
    } else {
      expanded.add(folderId);
    }
    setExpandedFolders(expanded);
  };

  const toggleCollection = (collectionId: string) => {
    const expanded = new Set(expandedCollections);
    if (expanded.has(collectionId)) {
      expanded.delete(collectionId);
    } else {
      expanded.add(collectionId);
    }
    setExpandedCollections(expanded);
  };

  const createNewCollection = async () => {
    if (!newCollectionName.trim()) return;

    const newCollection: Collection = {
      id: Date.now().toString(),
      name: newCollectionName,
      requests: [{
        id: Date.now().toString(),
        name: 'New Request',
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          'Content-Type': 'application/json'
        }
      }]
    };

    await onSaveCollection(newCollection);
    setNewCollectionName('');
    setShowNewCollection(false);
    setExpandedCollections(prev => new Set([...prev, newCollection.id]));
  };

  const addRequestToCollection = async (collection: Collection) => {
    const newRequest: ApiRequest = {
      id: Date.now().toString(),
      name: 'New Request',
      method: 'GET',
      url: 'https://api.example.com',
      headers: {
        'Content-Type': 'application/json'
      },
      // Set inherit as default if collection has auth configured
      auth: collection.auth ? { type: 'inherit' } : undefined
    };

    const updatedCollection = {
      ...collection,
      requests: [...collection.requests, newRequest]
    };

    await onSaveCollection(updatedCollection);
    onSelectRequest(newRequest);
  };

  const createFolder = async (collection: Collection) => {
    if (!newFolderName.trim()) return;
    const newFolder: CollectionFolder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      requests: [],
    };
    const updatedCollection = {
      ...collection,
      folders: [...(collection.folders || []), newFolder],
    };
    await onSaveCollection(updatedCollection);
    setNewFolderCollectionId(null);
    setNewFolderName('');
    setExpandedFolders(prev => new Set([...prev, newFolder.id]));
  };

  const deleteCollection = async (collectionId: string, collectionName: string) => {
    if (!confirm(`Are you sure you want to delete the collection "${collectionName}"? This action cannot be undone.`)) {
      return;
    }
    await onDeleteCollection(collectionId);
  };

  const deleteRequest = async (collection: Collection, requestId: string, requestName: string) => {
    if (!confirm(`Are you sure you want to delete the request "${requestName}"? This action cannot be undone.`)) {
      return;
    }
    await onDeleteRequest(collection.id, requestId);
  };

  const startEditingCollection = (collection: Collection) => {
    setEditingCollection(collection.id);
    setEditName(collection.name);
  };

  const saveCollectionName = async (collection: Collection) => {
    if (!editName.trim()) return;

    const updatedCollection = {
      ...collection,
      name: editName
    };

    await onSaveCollection(updatedCollection);
    setEditingCollection(null);
    setEditName('');
  };

  const cancelEdit = () => {
    setEditingCollection(null);
    setEditingRequest(null);
    setEditingFolder(null);
    setEditingSavedResponse(null);
    setEditName('');
  };

  const toggleRequest = (requestId: string) => {
    const expanded = new Set(expandedRequests);
    if (expanded.has(requestId)) {
      expanded.delete(requestId);
    } else {
      expanded.add(requestId);
    }
    setExpandedRequests(expanded);
  };

  const saveSavedResponseName = (id: string) => {
    if (!editName.trim()) return;
    onRenameSavedResponse(id, editName.trim());
    setEditingSavedResponse(null);
    setEditName('');
  };

  const startEditingRequest = (request: ApiRequest) => {
    setEditingRequest(request.id);
    setEditName(request.name);
  };

  const saveRequestName = async (collection: Collection, request: ApiRequest) => {
    if (!editName.trim()) return;

    const updatedCollection = {
      ...collection,
      requests: collection.requests.map(r =>
        r.id === request.id ? { ...r, name: editName } : r
      ),
      folders: collection.folders?.map(f => ({
        ...f,
        requests: f.requests.map(r =>
          r.id === request.id ? { ...r, name: editName } : r
        ),
      })),
    };

    await onSaveCollection(updatedCollection);
    setEditingRequest(null);
    setEditName('');
  };

  const startEditingFolder = (folder: CollectionFolder) => {
    setEditingFolder(folder.id);
    setEditName(folder.name);
  };

  const saveFolderName = async (collection: Collection, folder: CollectionFolder) => {
    if (!editName.trim()) return;
    const updatedCollection = {
      ...collection,
      folders: collection.folders?.map(f =>
        f.id === folder.id ? { ...f, name: editName } : f
      ),
    };
    await onSaveCollection(updatedCollection);
    setEditingFolder(null);
    setEditName('');
  };

  const deleteFolder = async (collection: Collection, folder: CollectionFolder) => {
    const count = folder.requests.length;
    const warning = count > 0
      ? `This folder contains ${count} request${count !== 1 ? 's' : ''}. `
      : '';
    if (!confirm(`${warning}Are you sure you want to delete the folder "${folder.name}"? This action cannot be undone.`)) {
      return;
    }
    const updatedCollection = {
      ...collection,
      folders: collection.folders?.filter(f => f.id !== folder.id),
    };
    await onSaveCollection(updatedCollection);
  };

  // ── Drag and drop handlers ──────────────────────────────────────────────

  const handleDragStart = (
    e: React.DragEvent,
    type: 'request' | 'folder',
    id: string,
    sourceCollectionId: string,
    sourceFolderId: string | null,
  ) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', id); // required by some Chromium builds
    e.dataTransfer.effectAllowed = 'move';
    // Set ref immediately so drag handlers can read it
    const item = { type, id, sourceCollectionId, sourceFolderId };
    dragItemRef.current = item;
    // Defer state update so React doesn't re-render (and shift DOM) during drag init
    setTimeout(() => setDragItem(item), 0);
  };

  const handleDragEnd = () => {
    dragItemRef.current = null;
    setDragItem(null);
    setDropIndicator(null);
    setDropFolderHighlight(null);
  };

  const handleDragOverZone = (
    e: React.DragEvent,
    collectionId: string,
    folderId: string | null,
    insertIndex: number,
  ) => {
    const item = dragItemRef.current;
    if (!item) return;
    // Folders cannot be dropped inside another folder
    if (item.type === 'folder' && folderId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropIndicator({ collectionId, folderId, insertIndex });
    setDropFolderHighlight(null);
  };

  const handleDropOnZone = (
    e: React.DragEvent,
    collectionId: string,
    folderId: string | null,
    insertIndex: number,
  ) => {
    const item = dragItemRef.current;
    e.preventDefault();
    e.stopPropagation();
    if (!item) return;
    if (item.type === 'folder' && folderId !== null) return;
    handleMove(collectionId, folderId, insertIndex);
  };

  // Folder header is also a drop target for requests (drops to end of folder)
  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    const item = dragItemRef.current;
    if (!item || item.type !== 'request') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropFolderHighlight(folderId);
    setDropIndicator(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, collectionId: string, folder: CollectionFolder) => {
    const item = dragItemRef.current;
    e.preventDefault();
    e.stopPropagation();
    if (!item || item.type !== 'request') return;
    handleMove(collectionId, folder.id, folder.requests.length);
    setDropFolderHighlight(null);
  };

  const handleMove = async (
    targetCollectionId: string,
    targetFolderId: string | null,
    insertIndex: number,
  ) => {
    const currentDragItem = dragItemRef.current;
    if (!currentDragItem) return;

    const sourceCollection = collections.find(c => c.id === currentDragItem.sourceCollectionId);
    const targetCollection = collections.find(c => c.id === targetCollectionId);
    if (!sourceCollection || !targetCollection) return;

    const sameCollection = currentDragItem.sourceCollectionId === targetCollectionId;

    if (currentDragItem.type === 'request') {
      // Find the request in its source location
      let request: ApiRequest | undefined;
      if (currentDragItem.sourceFolderId) {
        const folder = sourceCollection.folders?.find(f => f.id === currentDragItem.sourceFolderId);
        request = folder?.requests.find(r => r.id === currentDragItem.id);
      } else {
        request = sourceCollection.requests.find(r => r.id === currentDragItem.id);
      }
      if (!request) return;

      // Remove from source
      let removedSource: Collection;
      if (currentDragItem.sourceFolderId) {
        removedSource = {
          ...sourceCollection,
          folders: sourceCollection.folders?.map(f =>
            f.id === currentDragItem.sourceFolderId
              ? { ...f, requests: f.requests.filter(r => r.id !== currentDragItem.id) }
              : f
          ),
        };
      } else {
        removedSource = {
          ...sourceCollection,
          requests: sourceCollection.requests.filter(r => r.id !== currentDragItem.id),
        };
      }

      // Adjust insertIndex for same-container reorders (item removal shifts indices)
      let actualInsertIndex = insertIndex;
      if (sameCollection) {
        const sameContainer =
          (!currentDragItem.sourceFolderId && !targetFolderId) ||
          (currentDragItem.sourceFolderId === targetFolderId);
        if (sameContainer) {
          let fromIndex: number;
          if (targetFolderId) {
            const folder = sourceCollection.folders?.find(f => f.id === targetFolderId);
            fromIndex = folder?.requests.findIndex(r => r.id === currentDragItem.id) ?? -1;
          } else {
            fromIndex = sourceCollection.requests.findIndex(r => r.id === currentDragItem.id);
          }
          if (fromIndex >= 0 && fromIndex < insertIndex) {
            actualInsertIndex = insertIndex - 1;
          }
        }
      }

      // Insert into target
      const baseTarget = sameCollection ? removedSource : targetCollection;
      let updatedTarget: Collection;

      if (targetFolderId) {
        updatedTarget = {
          ...baseTarget,
          folders: baseTarget.folders?.map(f => {
            if (f.id !== targetFolderId) return f;
            const newRequests = [...f.requests];
            newRequests.splice(actualInsertIndex, 0, request!);
            return { ...f, requests: newRequests };
          }),
        };
      } else {
        const newRequests = [...(baseTarget.requests || [])];
        newRequests.splice(actualInsertIndex, 0, request);
        updatedTarget = { ...baseTarget, requests: newRequests };
      }

      if (sameCollection) {
        await onSaveCollection(updatedTarget);
      } else {
        await onSaveCollection(removedSource);
        await onSaveCollection(updatedTarget);
      }
    } else {
      // Moving a folder — targetFolderId must be null
      const folder = sourceCollection.folders?.find(f => f.id === currentDragItem.id);
      if (!folder) return;

      if (sameCollection) {
        const folders = [...(sourceCollection.folders || [])];
        const fromIndex = folders.findIndex(f => f.id === currentDragItem.id);
        folders.splice(fromIndex, 1);
        const actualIdx = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
        folders.splice(actualIdx, 0, folder);
        await onSaveCollection({ ...sourceCollection, folders });
      } else {
        const updatedSource = {
          ...sourceCollection,
          folders: sourceCollection.folders?.filter(f => f.id !== currentDragItem.id),
        };
        const targetFolders = [...(targetCollection.folders || [])];
        targetFolders.splice(insertIndex, 0, folder);
        await onSaveCollection(updatedSource);
        await onSaveCollection({ ...targetCollection, folders: targetFolders });
      }
    }

    dragItemRef.current = null;
    setDragItem(null);
    setDropIndicator(null);
    setDropFolderHighlight(null);
  };

  // Renders a thin drop-zone line between items
  const renderDropZone = (
    collectionId: string,
    folderId: string | null,
    index: number,
    forType: 'request' | 'folder',
  ) => {
    if (!dragItem || dragItem.type !== forType) return null;
    // Folders can only land at collection root level
    if (forType === 'folder' && folderId !== null) return null;

    const isActive =
      dropIndicator?.collectionId === collectionId &&
      dropIndicator?.folderId === folderId &&
      dropIndicator?.insertIndex === index;

    return (
      <div
        style={{
          height: '8px',
          display: 'flex',
          alignItems: 'center',
        }}
        onDragOver={(e) => handleDragOverZone(e, collectionId, folderId, index)}
        onDrop={(e) => handleDropOnZone(e, collectionId, folderId, index)}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (
            dropIndicator?.collectionId === collectionId &&
            dropIndicator?.folderId === folderId &&
            dropIndicator?.insertIndex === index
          ) {
            setDropIndicator(null);
          }
        }}
      >
        {isActive && (
          <div style={{ height: '2px', width: '100%', backgroundColor: '#0d7377', borderRadius: '1px', pointerEvents: 'none' }} />
        )}
      </div>
    );
  };

  return (
    <div className="sidebar">
      {/* Workspace Info Display */}
      {activeWorkspace && (
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #404040',
          backgroundColor: '#1a2d2d'
        }}>
          <div style={{
            fontSize: '0.75rem',
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.25rem'
          }}>
            Active Workspace
          </div>
          <div style={{
            fontSize: '1rem',
            color: '#ffffff',
            fontWeight: 'bold',
            marginBottom: '0.25rem'
          }}>
            {activeWorkspace.name}
          </div>
          {activeWorkspace.description && (
            <div style={{
              fontSize: '0.8rem',
              color: '#aaa',
              fontStyle: 'italic'
            }}>
              {activeWorkspace.description}
            </div>
          )}
        </div>
      )}

      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Collections</h3>
          <button
            className="button"
            onClick={() => setShowNewCollection(true)}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
          >
            + New
          </button>
        </div>

        {showNewCollection && (
          <div style={{ margin: '0.5rem 0', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.8rem' }}
              onKeyPress={(e) => e.key === 'Enter' && createNewCollection()}
            />
            <button className="button" onClick={createNewCollection} style={{ fontSize: '0.8rem' }}>
              ✓
            </button>
            <button
              className="button-secondary button"
              onClick={() => setShowNewCollection(false)}
              style={{ fontSize: '0.8rem' }}
            >
              ✗
            </button>
          </div>
        )}

        {collections.map(collection => (
          <div key={collection.id} className="collection-item">
            <div className="collection-header">
              <button
                onClick={() => toggleCollection(collection.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flex: 1
                }}
              >
                <span style={{ marginRight: '0.5rem' }}>
                  {expandedCollections.has(collection.id) ? '▼' : '▶'}
                </span>
                {editingCollection === collection.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="form-input"
                    style={{ fontSize: '0.9rem', flex: 1, marginRight: '0.5rem' }}
                    onKeyPress={(e) => e.key === 'Enter' && saveCollectionName(collection)}
                    onBlur={() => saveCollectionName(collection)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collection.name}</span>
                )}
              </button>


              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {editingCollection === collection.id ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveCollectionName(collection);
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button"
                    >
                      ✓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEdit();
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button-secondary button"
                    >
                      ✗
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addRequestToCollection(collection);
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
                      className="button"
                      title="Add request"
                    >
                      +
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewFolderCollectionId(collection.id);
                        setNewFolderName('');
                        setExpandedCollections(prev => new Set([...prev, collection.id]));
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button-secondary button"
                      title="Add folder"
                    >
                      📁
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingCollection(collection);
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button-secondary button"
                      title="Rename collection"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCollectionAuth(collection);
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button-secondary button"
                      title="Edit collection authentication"
                    >
                      🔐
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCollection(collection.id, collection.name);
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                      className="button-secondary button"
                      title="Delete collection"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>

            {expandedCollections.has(collection.id) && (
              <div>
                {newFolderCollectionId === collection.id && (
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.35rem 0.5rem', borderTop: '1px solid #333' }}>
                    <input
                      type="text"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="form-input"
                      style={{ fontSize: '0.8rem', flex: 1 }}
                      onKeyPress={(e) => e.key === 'Enter' && createFolder(collection)}
                      autoFocus
                    />
                    <button className="button" onClick={() => createFolder(collection)} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}>✓</button>
                    <button className="button-secondary button" onClick={() => { setNewFolderCollectionId(null); setNewFolderName(''); }} style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}>✗</button>
                  </div>
                )}

                {/* Folders */}
                {renderDropZone(collection.id, null, 0, 'folder')}
                {collection.folders?.map((folder: CollectionFolder, folderIndex: number) => {
                  const isFolderExpanded = expandedFolders.has(folder.id);
                  const isFolderDragging = dragItem?.id === folder.id;
                  const isFolderDropTarget = dropFolderHighlight === folder.id;
                  return (
                    <div key={folder.id}>
                      {/* Folder header row — draggable */}
                      <div
                        draggable={editingFolder !== folder.id}
                        onDragStart={(e) => handleDragStart(e, 'folder', folder.id, collection.id, null)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dropFolderHighlight === folder.id) setDropFolderHighlight(null);
                        }}
                        onDrop={(e) => handleDropOnFolder(e, collection.id, folder)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.35rem 0.5rem 0.35rem 0.25rem',
                          userSelect: 'none',
                          borderTop: '1px solid #333',
                          opacity: isFolderDragging ? 0.4 : 1,
                          backgroundColor: isFolderDropTarget ? '#0d737720' : 'transparent',
                          outline: isFolderDropTarget ? '1px solid #0d7377' : 'none',
                          borderRadius: isFolderDropTarget ? '3px' : '0',
                          cursor: editingFolder !== folder.id ? 'grab' : 'default',
                        }}
                      >
                        {editingFolder !== folder.id && (
                          <span style={{ color: '#555', fontSize: '0.85rem', padding: '0 4px', flexShrink: 0, userSelect: 'none', pointerEvents: 'none' }}>⠿</span>
                        )}
                        <div
                          onClick={() => { if (editingFolder !== folder.id) toggleFolder(folder.id); }}
                          style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: editingFolder === folder.id ? 'default' : 'pointer', minWidth: 0, overflow: 'hidden' }}
                        >
                          <span style={{ marginRight: '0.5rem', flexShrink: 0 }}>
                            {isFolderExpanded ? '▼' : '▶'}
                          </span>
                          {editingFolder === folder.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.85rem', flex: 1, marginRight: '0.25rem' }}
                              onKeyPress={(e) => e.key === 'Enter' && saveFolderName(collection, folder)}
                              onBlur={() => saveFolderName(collection, folder)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span style={{ color: '#ccc', fontSize: '0.9rem', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {folder.name}
                            </span>
                          )}
                        </div>
                        {editingFolder === folder.id ? (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); saveFolderName(collection, folder); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} className="button">✓</button>
                            <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }} className="button-secondary button">✗</button>
                          </>
                        ) : (
                          <>
                            <span style={{ color: '#555', fontSize: '0.7rem', marginRight: '0.3rem' }}>{folder.requests.length}</span>
                            <button onClick={(e) => { e.stopPropagation(); startEditingFolder(folder); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginRight: '0.2rem' }} className="button-secondary button" title="Rename folder">✏️</button>
                            <button onClick={(e) => { e.stopPropagation(); deleteFolder(collection, folder); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} className="button-secondary button" title="Delete folder">🗑️</button>
                          </>
                        )}
                      </div>

                      {/* Requests inside this folder */}
                      {isFolderExpanded && (
                        <>
                          {renderDropZone(collection.id, folder.id, 0, 'request')}
                          {folder.requests.map((request, reqIndex) => {
                            const reqSavedResponses = savedResponses.filter(s => s.requestId === request.id);
                            const isReqExpanded = expandedRequests.has(request.id);
                            const isReqDragging = dragItem?.id === request.id;
                            return (
                              <div key={request.id}>
                                <div
                                  className="request-item"
                                  draggable={editingRequest !== request.id}
                                  onDragStart={(e) => handleDragStart(e, 'request', request.id, collection.id, folder.id)}
                                  onDragEnd={handleDragEnd}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.5rem 0.75rem 0.5rem 0.25rem',
                                    cursor: editingRequest !== request.id ? 'grab' : 'default',
                                    opacity: isReqDragging ? 0.4 : 1,
                                  }}
                                  onClick={() => { if (editingRequest !== request.id) onSelectRequest(request); }}
                                >
                                  {editingRequest !== request.id && (
                                    <span style={{ color: '#555', fontSize: '0.85rem', padding: '0 4px 0 1.5rem', flexShrink: 0, userSelect: 'none', pointerEvents: 'none' }}>⠿</span>
                                  )}
                                  {editingRequest === request.id ? (
                                    <>
                                      <span className={`http-method ${request.method}`} style={{ marginRight: '0.5rem' }}>
                                        {request.method}
                                      </span>
                                      <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="form-input"
                                        style={{ fontSize: '0.9rem', flex: 1, marginRight: '0.5rem' }}
                                        onKeyPress={(e) => e.key === 'Enter' && saveRequestName(collection, request)}
                                        onBlur={() => saveRequestName(collection, request)}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                      />
                                      <button onClick={(e) => { e.stopPropagation(); saveRequestName(collection, request); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} className="button">✓</button>
                                      <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }} className="button-secondary button">✗</button>
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                        {reqSavedResponses.length > 0 && (
                                          <button onClick={(e) => { e.stopPropagation(); toggleRequest(request.id); }} style={{ background: 'none', border: 'none', color: '#888', padding: '0', cursor: 'pointer', fontSize: '0.6rem', flexShrink: 0 }} title="Toggle saved responses">
                                            {isReqExpanded ? '▼' : '▶'}
                                          </button>
                                        )}
                                        <span className={`http-method ${request.method}`}>{request.method}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{request.name}</span>
                                      </div>
                                      <button onClick={(e) => { e.stopPropagation(); startEditingRequest(request); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginRight: '0.25rem' }} className="button-secondary button" title="Rename request">✏️</button>
                                      <button onClick={(e) => { e.stopPropagation(); deleteRequest(collection, request.id, request.name); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} className="button-secondary button" title="Delete request">🗑️</button>
                                    </>
                                  )}
                                </div>
                                {isReqExpanded && reqSavedResponses.length > 0 && (
                                  <div style={{ paddingLeft: '2.5rem' }}>
                                    {reqSavedResponses.map(saved => (
                                      <div
                                        key={saved.id}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0.5rem', cursor: 'pointer', borderLeft: '2px solid #0d7377', marginBottom: '2px', borderRadius: '0 4px 4px 0', backgroundColor: activeSavedResponse?.id === saved.id ? '#0d737720' : 'transparent' }}
                                        onClick={() => { if (editingSavedResponse !== saved.id) onSelectSavedResponse(saved); }}
                                      >
                                        {editingSavedResponse === saved.id ? (
                                          <>
                                            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="form-input" style={{ fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }} onKeyPress={(e) => e.key === 'Enter' && saveSavedResponseName(saved.id)} onBlur={() => saveSavedResponseName(saved.id)} onClick={(e) => e.stopPropagation()} autoFocus />
                                            <button onClick={(e) => { e.stopPropagation(); saveSavedResponseName(saved.id); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} className="button">✓</button>
                                            <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }} className="button-secondary button">✗</button>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{ fontSize: '0.8rem', color: activeSavedResponse?.id === saved.id ? '#0d9e9e' : '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>↳ {saved.name}</span>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingSavedResponse(saved.id); setEditName(saved.name); }} style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem', marginRight: '0.2rem', flexShrink: 0 }} className="button-secondary button" title="Rename saved response">✏️</button>
                                            <button onClick={(e) => { e.stopPropagation(); onDeleteSavedResponse(saved.id); }} style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem', flexShrink: 0 }} className="button-secondary button" title="Delete saved response">🗑️</button>
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {renderDropZone(collection.id, folder.id, reqIndex + 1, 'request')}
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* Folder drop zone after this folder (for reordering) */}
                      {renderDropZone(collection.id, null, folderIndex + 1, 'folder')}
                    </div>
                  );
                })}

                {/* Top-level requests in collection */}
                {renderDropZone(collection.id, null, 0, 'request')}
                {collection.requests.map((request, reqIndex) => {
                  const reqSavedResponses = savedResponses.filter(s => s.requestId === request.id);
                  const isExpanded = expandedRequests.has(request.id);
                  const isReqDragging = dragItem?.id === request.id;
                  return (
                    <div key={request.id}>
                      <div
                        className="request-item"
                        draggable={editingRequest !== request.id}
                        onDragStart={(e) => handleDragStart(e, 'request', request.id, collection.id, null)}
                        onDragEnd={handleDragEnd}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.75rem 0.5rem 0.25rem',
                          cursor: editingRequest !== request.id ? 'grab' : 'default',
                          opacity: isReqDragging ? 0.4 : 1,
                        }}
                        onClick={() => { if (editingRequest !== request.id) onSelectRequest(request); }}
                      >
                        {editingRequest !== request.id && (
                          <span style={{ color: '#555', fontSize: '0.85rem', padding: '0 4px', flexShrink: 0, userSelect: 'none', pointerEvents: 'none' }}>⠿</span>
                        )}
                        {editingRequest === request.id ? (
                          <>
                            <span className={`http-method ${request.method}`} style={{ marginRight: '0.5rem' }}>
                              {request.method}
                            </span>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.9rem', flex: 1, marginRight: '0.5rem' }}
                              onKeyPress={(e) => e.key === 'Enter' && saveRequestName(collection, request)}
                              onBlur={() => saveRequestName(collection, request)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); saveRequestName(collection, request); }}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                              className="button"
                            >✓</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }}
                              className="button-secondary button"
                            >✗</button>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              {reqSavedResponses.length > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRequest(request.id); }}
                                  style={{ background: 'none', border: 'none', color: '#888', padding: '0', cursor: 'pointer', fontSize: '0.6rem', flexShrink: 0 }}
                                  title="Toggle saved responses"
                                >
                                  {isExpanded ? '▼' : '▶'}
                                </button>
                              )}
                              <span className={`http-method ${request.method}`}>{request.method}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.name}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditingRequest(request); }}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginRight: '0.25rem' }}
                              className="button-secondary button"
                              title="Rename request"
                            >✏️</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteRequest(collection, request.id, request.name); }}
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                              className="button-secondary button"
                              title="Delete request"
                            >🗑️</button>
                          </>
                        )}
                      </div>

                      {isExpanded && reqSavedResponses.length > 0 && (
                        <div style={{ paddingLeft: '1.5rem' }}>
                          {reqSavedResponses.map(saved => (
                            <div
                              key={saved.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.3rem 0.5rem',
                                cursor: 'pointer',
                                borderLeft: `2px solid #0d7377`,
                                marginBottom: '2px',
                                borderRadius: '0 4px 4px 0',
                                backgroundColor: activeSavedResponse?.id === saved.id ? '#0d737720' : 'transparent',
                              }}
                              onClick={() => { if (editingSavedResponse !== saved.id) onSelectSavedResponse(saved); }}
                            >
                              {editingSavedResponse === saved.id ? (
                                <>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="form-input"
                                    style={{ fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }}
                                    onKeyPress={(e) => e.key === 'Enter' && saveSavedResponseName(saved.id)}
                                    onBlur={() => saveSavedResponseName(saved.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); saveSavedResponseName(saved.id); }}
                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                                    className="button"
                                  >✓</button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }}
                                    className="button-secondary button"
                                  >✗</button>
                                </>
                              ) : (
                                <>
                                  <span style={{
                                    fontSize: '0.8rem',
                                    color: activeSavedResponse?.id === saved.id ? '#0d9e9e' : '#aaa',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1,
                                  }}>
                                    ↳ {saved.name}
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingSavedResponse(saved.id); setEditName(saved.name); }}
                                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem', marginRight: '0.2rem', flexShrink: 0 }}
                                    className="button-secondary button"
                                    title="Rename saved response"
                                  >✏️</button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteSavedResponse(saved.id); }}
                                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem', flexShrink: 0 }}
                                    className="button-secondary button"
                                    title="Delete saved response"
                                  >🗑️</button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {renderDropZone(collection.id, null, reqIndex + 1, 'request')}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
