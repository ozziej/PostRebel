import React from 'react';
import { Workspace, Environment } from '../types';

interface TopBarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  environments: Environment[];
  activeEnvironment: Environment | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onSelectEnvironment: (environment: Environment) => void;
  onOpenWorkspaceManager: () => void;
  onOpenEnvironmentManager: () => void;
  onOpenCertManager: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  workspaces,
  activeWorkspace,
  environments,
  activeEnvironment,
  onSelectWorkspace,
  onSelectEnvironment,
  onOpenWorkspaceManager,
  onOpenEnvironmentManager,
  onOpenCertManager,
  onOpenSettings
}) => {
  return (
    <div style={{
      height: '60px',
      backgroundColor: '#2d2d2d',
      borderBottom: '1px solid #404040',
      display: 'flex',
      alignItems: 'center',
      padding: '0 1rem',
      gap: '1rem',
      flexShrink: 0
    }}>
      {/* Logo/Brand */}
      <div style={{
        fontWeight: 'bold',
        fontSize: '1.2rem',
        color: '#0d7377',
        marginRight: '1rem'
      }}>
        PostRebel
      </div>

      {/* Workspace Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        maxWidth: '400px'
      }}>
        <label style={{
          fontSize: '0.85rem',
          color: '#cccccc',
          whiteSpace: 'nowrap'
        }}>
          Workspace:
        </label>
        <select
          value={activeWorkspace?.id || ''}
          onChange={(e) => {
            const workspace = workspaces.find(w => w.id === e.target.value);
            if (workspace) onSelectWorkspace(workspace);
          }}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: '#404040',
            border: '1px solid #555',
            color: '#ffffff',
            borderRadius: '4px',
            fontSize: '0.9rem',
            minWidth: '150px'
          }}
        >
          <option value="">No Workspace</option>
          {workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <button
          onClick={onOpenWorkspaceManager}
          className="button"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
          title="Manage workspaces"
        >
          ⚙️ Manage
        </button>
      </div>

      {/* Environment Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        maxWidth: '400px'
      }}>
        <label style={{
          fontSize: '0.85rem',
          color: '#cccccc',
          whiteSpace: 'nowrap'
        }}>
          Environment:
        </label>
        <select
          value={activeEnvironment?.id || ''}
          onChange={(e) => {
            const environment = environments.find(env => env.id === e.target.value);
            if (environment) onSelectEnvironment(environment);
          }}
          style={{
            flex: 1,
            padding: '0.5rem',
            backgroundColor: '#404040',
            border: '1px solid #555',
            color: '#ffffff',
            borderRadius: '4px',
            fontSize: '0.9rem',
            minWidth: '150px'
          }}
        >
          <option value="">No Environment</option>
          {environments.map(env => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>
        <button
          onClick={onOpenEnvironmentManager}
          className="button"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
          title="Manage environments"
        >
          ⚙️ Manage
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }}></div>

      {/* Tools Menu */}
      <div style={{
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button
          onClick={onOpenCertManager}
          className="button-secondary button"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
          title="Manage SSL/TLS certificates"
        >
          🔒 Certificates
        </button>
        <button
          onClick={onOpenSettings}
          className="button-secondary button"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
          title="Application settings"
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  );
};
