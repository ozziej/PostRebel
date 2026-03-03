import React, { useState } from 'react';
import { Environment } from '../types';

interface EnvironmentManagerProps {
  isOpen: boolean;
  environments: Environment[];
  activeEnvironment: Environment | null;
  onClose: () => void;
  onCreateEnvironment: (name: string) => Promise<void>;
  onUpdateEnvironment: (environmentId: string, name: string) => Promise<void>;
  onDeleteEnvironment: (environmentId: string) => Promise<void>;
  onSelectEnvironment: (environment: Environment) => void;
  onEditVariables: (environment: Environment) => void;
  onOpenImport?: () => void;
}

export const EnvironmentManager: React.FC<EnvironmentManagerProps> = ({
  isOpen,
  environments,
  activeEnvironment,
  onClose,
  onCreateEnvironment,
  onUpdateEnvironment,
  onDeleteEnvironment,
  onSelectEnvironment,
  onEditVariables,
  onOpenImport
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newName.trim()) {
      alert('Environment name is required');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateEnvironment(newName);
      setNewName('');
      setShowCreateForm(false);
    } catch (error) {
      alert(`Failed to create environment: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditingEnvironment = (environment: Environment) => {
    setEditingEnvironment(environment.id);
    setNewName(environment.name);
  };

  const handleUpdate = async (environmentId: string) => {
    if (!newName.trim()) {
      alert('Environment name is required');
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdateEnvironment(environmentId, newName);
      setEditingEnvironment(null);
      setNewName('');
    } catch (error) {
      alert(`Failed to update environment: ${error}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (environment: Environment) => {
    if (!confirm(`Are you sure you want to delete environment "${environment.name}"?\n\nThis will delete all variables in this environment.\n\nThis action cannot be undone!`)) {
      return;
    }

    if (activeEnvironment?.id === environment.id) {
      alert('Cannot delete the active environment. Please switch to another environment first.');
      return;
    }

    try {
      await onDeleteEnvironment(environment.id);
    } catch (error) {
      alert(`Failed to delete environment: ${error}`);
    }
  };

  const cancelEdit = () => {
    setEditingEnvironment(null);
    setNewName('');
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
          <h2 style={{ margin: 0 }}>Environment Manager</h2>
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
            <strong>💡 What are Environments?</strong>
          </div>
          <ul style={{
            fontSize: '0.85rem',
            color: '#888',
            margin: '0.5rem 0',
            paddingLeft: '1.5rem',
            lineHeight: '1.6'
          }}>
            <li>Environments store variables like API URLs, tokens, and credentials</li>
            <li>Use {`{{variable}}`} syntax in requests to reference environment values</li>
            <li>Perfect for managing dev, staging, and production configurations</li>
            <li>Secret variables are automatically kept separate from git</li>
          </ul>
        </div>

        {/* Create New Environment Button */}
        {!showCreateForm && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setShowCreateForm(true)}
              className="button"
              style={{ flex: 1 }}
            >
              + New Environment
            </button>
            {onOpenImport && (
              <button
                onClick={() => {
                  onClose();
                  onOpenImport();
                }}
                className="button-secondary button"
                title="Import Postman environment"
              >
                Import
              </button>
            )}
          </div>
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
            <h3 style={{ marginTop: 0 }}>Create New Environment</h3>

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
                placeholder="Production"
                className="form-input"
                disabled={isCreating}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleCreate}
                className="button"
                disabled={isCreating || !newName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create Environment'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName('');
                }}
                className="button-secondary button"
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Environments List */}
        <div>
          <h3 style={{ marginBottom: '1rem' }}>
            Existing Environments ({environments.length})
          </h3>

          {environments.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#666',
              fontSize: '0.9rem'
            }}>
              No environments yet. Create one to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {environments.map(environment => (
                editingEnvironment === environment.id ? (
                  <div
                    key={environment.id}
                    style={{
                      backgroundColor: '#1a1a1a',
                      border: '2px solid #0d7377',
                      borderRadius: '4px',
                      padding: '1rem'
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Edit Environment</h4>
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
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleUpdate(environment.id)}
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
                    key={environment.id}
                    style={{
                      backgroundColor: activeEnvironment?.id === environment.id ? '#1a2d2d' : '#404040',
                      border: `1px solid ${activeEnvironment?.id === environment.id ? '#0d7377' : '#555'}`,
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
                          {environment.name}
                          {activeEnvironment?.id === environment.id && (
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
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#888'
                        }}>
                          {Object.keys(environment.variables).length} variable{Object.keys(environment.variables).length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button
                        onClick={() => {
                          onSelectEnvironment(environment);
                          onClose();
                        }}
                        className="button"
                        style={{ flex: 1 }}
                      >
                        Switch to Environment
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditVariables(environment);
                        }}
                        className="button-secondary button"
                        title="Edit variables"
                      >
                        📝
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingEnvironment(environment);
                        }}
                        className="button-secondary button"
                        title="Rename environment"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(environment);
                        }}
                        className="button-secondary button"
                        title="Delete environment"
                        disabled={activeEnvironment?.id === environment.id}
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

        {/* Variables Info */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#1a2d1a',
          border: '1px solid #0d7377',
          borderRadius: '4px'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#cccccc' }}>
            <strong style={{ color: '#10b981' }}>📝 Managing Variables:</strong>
            <p style={{
              marginTop: '0.5rem',
              lineHeight: '1.5',
              color: '#888'
            }}>
              Click the 📝 button on any environment to edit its variables.
              Use the 🔒 button to mark sensitive values as secrets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
