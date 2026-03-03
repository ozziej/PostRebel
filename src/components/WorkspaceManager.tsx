import React, { useState } from 'react';
import { Workspace } from '../types';

interface WorkspaceManagerProps {
  isOpen: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onClose: () => void;
  onCreateWorkspace: (name: string, description?: string) => Promise<void>;
  onUpdateWorkspace: (workspaceId: string, name: string, description?: string) => Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onSelectWorkspace: (workspace: Workspace) => void;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  isOpen,
  workspaces,
  activeWorkspace,
  onClose,
  onCreateWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onSelectWorkspace
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newName.trim()) {
      alert('Workspace name is required');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateWorkspace(newName, newDescription);
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
    } catch (error) {
      alert(`Failed to create workspace: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditingWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace.id);
    setNewName(workspace.name);
    setNewDescription(workspace.description || '');
  };

  const handleUpdate = async (workspaceId: string) => {
    if (!newName.trim()) {
      alert('Workspace name is required');
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdateWorkspace(workspaceId, newName, newDescription);
      setEditingWorkspace(null);
      setNewName('');
      setNewDescription('');
    } catch (error) {
      alert(`Failed to update workspace: ${error}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (workspace: Workspace) => {
    if (!confirm(`Are you sure you want to delete workspace "${workspace.name}"?\n\nThis will delete ALL collections and environments in this workspace.\n\nThis action cannot be undone!`)) {
      return;
    }

    if (activeWorkspace?.id === workspace.id) {
      alert('Cannot delete the active workspace. Please switch to another workspace first.');
      return;
    }

    try {
      await onDeleteWorkspace(workspace.id);
    } catch (error) {
      alert(`Failed to delete workspace: ${error}`);
    }
  };

  const cancelEdit = () => {
    setEditingWorkspace(null);
    setNewName('');
    setNewDescription('');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#2d2d2d',
        padding: '2rem',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        border: '1px solid #404040'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ margin: 0 }}>Workspace Manager</h2>
          <button onClick={onClose} className="button-secondary button">
            ✗
          </button>
        </div>

        {/* Info Section */}
        <div style={{
          backgroundColor: '#1a2d2d',
          border: '1px solid #0d7377',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontSize: '0.9rem', color: '#cccccc', marginBottom: '0.5rem' }}>
            <strong>💡 What are Workspaces?</strong>
          </div>
          <ul style={{
            fontSize: '0.85rem',
            color: '#888',
            margin: '0.5rem 0',
            paddingLeft: '1.5rem',
            lineHeight: '1.6'
          }}>
            <li>Each workspace is a separate project with its own collections and environments</li>
            <li>Perfect for organizing different APIs or projects</li>
            <li>Each workspace gets its own git repository</li>
            <li>Secrets are automatically kept separate from committed files</li>
          </ul>
        </div>

        {/* Create New Workspace Button */}
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="button"
            style={{ width: '100%', marginBottom: '1.5rem' }}
          >
            + New Workspace
          </button>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #404040',
            borderRadius: '4px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ marginTop: 0 }}>Create New Workspace</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#cccccc',
                fontSize: '0.9rem'
              }}>
                Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My API Project"
                className="form-input"
                disabled={isCreating}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#cccccc',
                fontSize: '0.9rem'
              }}>
                Description (optional)
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Testing and development for our main API"
                className="form-textarea"
                style={{ minHeight: '80px' }}
                disabled={isCreating}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleCreate}
                className="button"
                disabled={isCreating || !newName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create Workspace'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName('');
                  setNewDescription('');
                }}
                className="button-secondary button"
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Workspaces List */}
        <div>
          <h3 style={{ marginBottom: '1rem' }}>
            Existing Workspaces ({workspaces.length})
          </h3>

          {workspaces.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#666',
              fontSize: '0.9rem'
            }}>
              No workspaces yet. Create one to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {workspaces.map(workspace => (
                editingWorkspace === workspace.id ? (
                  <div
                    key={workspace.id}
                    style={{
                      backgroundColor: '#1a1a1a',
                      border: '2px solid #0d7377',
                      borderRadius: '4px',
                      padding: '1rem'
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Edit Workspace</h4>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        color: '#cccccc',
                        fontSize: '0.9rem'
                      }}>
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="form-input"
                        disabled={isUpdating}
                      />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        color: '#cccccc',
                        fontSize: '0.9rem'
                      }}>
                        Description
                      </label>
                      <textarea
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        className="form-textarea"
                        style={{ minHeight: '60px' }}
                        disabled={isUpdating}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleUpdate(workspace.id)}
                        className="button"
                        disabled={isUpdating || !newName.trim()}
                      >
                        {isUpdating ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="button-secondary button"
                        disabled={isUpdating}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={workspace.id}
                    style={{
                      backgroundColor: activeWorkspace?.id === workspace.id ? '#1a2d2d' : '#404040',
                      border: `1px solid ${activeWorkspace?.id === workspace.id ? '#0d7377' : '#555'}`,
                      borderRadius: '4px',
                      padding: '1rem'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          marginBottom: '0.25rem',
                          color: '#ffffff'
                        }}>
                          {workspace.name}
                          {activeWorkspace?.id === workspace.id && (
                            <span style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.75rem',
                              color: '#10b981',
                              fontWeight: 'normal'
                            }}>
                              (Active)
                            </span>
                          )}
                        </div>
                        {workspace.description && (
                          <div style={{
                            fontSize: '0.85rem',
                            color: '#cccccc',
                            marginBottom: '0.5rem'
                          }}>
                            {workspace.description}
                          </div>
                        )}
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          fontFamily: 'monospace'
                        }}>
                          Folder: {workspace.id}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        onClick={() => {
                          onSelectWorkspace(workspace);
                          onClose();
                        }}
                        className="button"
                        style={{ flex: 1 }}
                      >
                        Switch to Workspace
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingWorkspace(workspace);
                        }}
                        className="button-secondary button"
                        title="Edit workspace"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(workspace);
                        }}
                        className="button-secondary button"
                        title="Delete workspace"
                        disabled={activeWorkspace?.id === workspace.id}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* Git Info */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#1a2d1a',
          border: '1px solid #0d7377',
          borderRadius: '4px'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#cccccc' }}>
            <strong style={{ color: '#10b981' }}>📁 Workspace Location:</strong>
            <p style={{
              marginTop: '0.5rem',
              lineHeight: '1.5',
              color: '#888',
              fontFamily: 'monospace',
              fontSize: '0.8rem'
            }}>
              ./workspaces/[workspace-id]/
            </p>
            <p style={{
              marginTop: '0.5rem',
              lineHeight: '1.5',
              color: '#888'
            }}>
              Each workspace is automatically initialized as a git repository.
              Secret files (*.secrets.json) are gitignored automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
