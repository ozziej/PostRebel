import React, { useState } from 'react';
import { Collection, Environment, ApiRequest, Workspace } from '../types';

interface SidebarProps {
  activeWorkspace: Workspace | null;
  collections: Collection[];
  environments: Environment[];
  activeEnvironment: Environment | null;
  onSelectEnvironment: (env: Environment) => void;
  onSelectRequest: (request: ApiRequest) => void;
  onSaveCollection: (collection: Collection) => Promise<any>;
  onSaveEnvironment: (environment: Environment) => Promise<any>;
  onDeleteCollection: (collectionId: string) => Promise<any>;
  onDeleteRequest: (collectionId: string, requestId: string) => Promise<any>;
  onDeleteEnvironment: (environmentId: string) => Promise<any>;
  onEditEnvironmentVariables: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeWorkspace,
  collections,
  environments,
  activeEnvironment,
  onSelectEnvironment,
  onSelectRequest,
  onSaveCollection,
  onSaveEnvironment,
  onDeleteCollection,
  onDeleteRequest,
  onDeleteEnvironment,
  onEditEnvironmentVariables
}) => {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewEnvironment, setShowNewEnvironment] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
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
    setEditingEnvironment(null);
    setEditingRequest(null);
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

  const createNewEnvironment = async () => {
    if (!newEnvironmentName.trim()) return;

    const newEnvironment: Environment = {
      id: Date.now().toString(),
      name: newEnvironmentName,
      variables: {}
    };

    await onSaveEnvironment(newEnvironment);
    setNewEnvironmentName('');
    setShowNewEnvironment(false);
  };

  const deleteEnvironment = async (environmentId: string, environmentName: string) => {
    if (!confirm(`Are you sure you want to delete the environment "${environmentName}"? This action cannot be undone.`)) {
      return;
    }
    await onDeleteEnvironment(environmentId);
  };

  const startEditingEnvironment = (environment: Environment) => {
    setEditingEnvironment(environment.id);
    setEditName(environment.name);
  };

  const saveEnvironmentName = async (environment: Environment) => {
    if (!editName.trim()) return;

    const updatedEnvironment = {
      ...environment,
      name: editName
    };

    await onSaveEnvironment(updatedEnvironment);
    setEditingEnvironment(null);
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

      <div className="sidebar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Environment</h3>
          <button
            className="button"
            onClick={() => setShowNewEnvironment(true)}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
          >
            + New
          </button>
        </div>

        <select
          className="environment-selector"
          value={activeEnvironment?.id || ''}
          onChange={(e) => {
            const env = environments.find(env => env.id === e.target.value);
            if (env) onSelectEnvironment(env);
          }}
        >
          <option value="">Select Environment</option>
          {environments.map(env => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>

        {activeEnvironment && (
          <button
            className="button"
            onClick={onEditEnvironmentVariables}
            style={{ width: '100%', fontSize: '0.85rem', marginTop: '0.5rem' }}
          >
            📝 Edit Variables ({Object.keys(activeEnvironment.variables).length})
          </button>
        )}

        {showNewEnvironment && (
          <div style={{ margin: '0.5rem 0', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Environment name"
              value={newEnvironmentName}
              onChange={(e) => setNewEnvironmentName(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.8rem' }}
              onKeyPress={(e) => e.key === 'Enter' && createNewEnvironment()}
            />
            <button className="button" onClick={createNewEnvironment} style={{ fontSize: '0.8rem' }}>
              ✓
            </button>
            <button
              className="button-secondary button"
              onClick={() => setShowNewEnvironment(false)}
              style={{ fontSize: '0.8rem' }}
            >
              ✗
            </button>
          </div>
        )}

        {environments.map(env => (
          <div key={env.id} style={{
            display: 'flex',
            alignItems: 'center',
            margin: '0.25rem 0',
            padding: '0.25rem 0.5rem',
            backgroundColor: activeEnvironment?.id === env.id ? '#0d7377' : 'transparent',
            borderRadius: '4px'
          }}>
            {editingEnvironment === env.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }}
                  onKeyPress={(e) => e.key === 'Enter' && saveEnvironmentName(env)}
                  onBlur={() => saveEnvironmentName(env)}
                  autoFocus
                />
                <button
                  onClick={() => saveEnvironmentName(env)}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                  className="button"
                >
                  ✓
                </button>
                <button
                  onClick={cancelEdit}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }}
                  className="button-secondary button"
                >
                  ✗
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{env.name}</span>
                <button
                  onClick={() => startEditingEnvironment(env)}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginRight: '0.25rem' }}
                  className="button-secondary button"
                  title="Rename environment"
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteEnvironment(env.id, env.name)}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                  className="button-secondary button"
                  title="Delete environment"
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        ))}
      </div>

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
                  <span>{collection.name}</span>
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
                {collection.requests.map(request => (
                  <div
                    key={request.id}
                    className="request-item"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem' }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            saveRequestName(collection, request);
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
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }}
                          className="button-secondary button"
                        >
                          ✗
                        </button>
                      </>
                    ) : (
                      <>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'pointer' }}
                          onClick={() => onSelectRequest(request)}
                        >
                          <span className={`http-method ${request.method}`}>
                            {request.method}
                          </span>
                          <span>{request.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingRequest(request);
                          }}
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', marginRight: '0.25rem' }}
                          className="button-secondary button"
                          title="Rename request"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRequest(collection, request.id, request.name);
                          }}
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                          className="button-secondary button"
                          title="Delete request"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};