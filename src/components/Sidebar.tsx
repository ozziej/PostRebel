import React, { useState } from 'react';
import { Collection, Environment, ApiRequest, Workspace, SavedResponse } from '../types';

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
  onOpenImport?: () => void;
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
  onOpenImport
}) => {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
  const [editingSavedResponse, setEditingSavedResponse] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
      }
    };

    const updatedCollection = {
      ...collection,
      requests: [...collection.requests, newRequest]
    };

    await onSaveCollection(updatedCollection);
    onSelectRequest(newRequest);
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
      )
    };

    await onSaveCollection(updatedCollection);
    setEditingRequest(null);
    setEditName('');
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
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              className="button"
              onClick={() => setShowNewCollection(true)}
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
            >
              + New
            </button>
            {onOpenImport && (
              <button
                className="button-secondary button"
                onClick={onOpenImport}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                title="Import collection or curl"
              >
                Import
              </button>
            )}
          </div>
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
                {collection.requests.map(request => {
                  const reqSavedResponses = savedResponses.filter(s => s.requestId === request.id);
                  const isExpanded = expandedRequests.has(request.id);
                  return (
                    <div key={request.id}>
                      <div
                        className="request-item"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                        onClick={() => { if (editingRequest !== request.id) onSelectRequest(request); }}
                      >
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