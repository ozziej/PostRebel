import React from 'react';
import { Workspace } from '../types';

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenManager: () => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onOpenManager
}) => {
  return (
    <div style={{
      padding: '1rem',
      borderBottom: '1px solid #404040',
      backgroundColor: '#333'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '0.9rem',
          color: '#cccccc',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Workspace
        </h3>
        <button
          className="button"
          onClick={onOpenManager}
          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
          title="Manage workspaces"
        >
          ⚙️
        </button>
      </div>

      <select
        className="environment-selector"
        value={activeWorkspace?.id || ''}
        onChange={(e) => {
          const workspace = workspaces.find(w => w.id === e.target.value);
          if (workspace) onSelectWorkspace(workspace);
        }}
        style={{ width: '100%' }}
      >
        <option value="">No Workspace</option>
        {workspaces.map(workspace => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>

      {activeWorkspace && (
        <div style={{
          fontSize: '0.75rem',
          color: '#888',
          marginTop: '0.5rem',
          fontStyle: 'italic'
        }}>
          {activeWorkspace.description || 'No description'}
        </div>
      )}
    </div>
  );
};
