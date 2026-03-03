import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [workspacesDirectory, setWorkspacesDirectory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getSettings();
      if (result.success && result.settings) {
        setWorkspacesDirectory(result.settings.workspacesDirectory || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseDirectory = async () => {
    try {
      const result = await window.electronAPI.chooseWorkspaceDirectory();
      if (result.success && result.directory) {
        setWorkspacesDirectory(result.directory);
      }
    } catch (error) {
      console.error('Failed to choose directory:', error);
      alert('Failed to select directory');
    }
  };

  const handleSave = async () => {
    if (!workspacesDirectory.trim()) {
      alert('Workspaces directory is required');
      return;
    }

    setIsSaving(true);
    try {
      const settings = {
        workspacesDirectory
      };

      const result = await window.electronAPI.updateSettings(settings);
      if (result.success) {
        alert('Settings saved! Please restart the application for changes to take effect.');
        onClose();
      } else {
        alert('Failed to save settings: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

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
      zIndex: 2000
    }}>
      <div style={{
        backgroundColor: '#2d2d2d',
        padding: '2rem',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '600px',
        border: '1px solid #404040'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button onClick={onClose} className="button-secondary button">
            ✗
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
            Loading settings...
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Workspaces Location</h3>
              <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                Choose where your workspaces are stored. This folder will contain all your API collections,
                environments, and settings.
              </p>

              <div style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}>
                <input
                  type="text"
                  value={workspacesDirectory}
                  onChange={(e) => setWorkspacesDirectory(e.target.value)}
                  placeholder="/path/to/workspaces"
                  className="form-input"
                  style={{ flex: 1 }}
                  disabled={isSaving}
                />
                <button
                  onClick={handleChooseDirectory}
                  className="button"
                  disabled={isSaving}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  📁 Browse
                </button>
              </div>

              <div style={{
                fontSize: '0.8rem',
                color: '#888',
                padding: '0.75rem',
                backgroundColor: '#1a1a1a',
                borderRadius: '4px',
                marginTop: '0.5rem'
              }}>
                <strong>💡 Tip:</strong> Store workspaces in a cloud-synced folder (Dropbox, Google Drive, iCloud)
                to keep them backed up and accessible across devices.
              </div>
            </div>

            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#2d1a1a',
              border: '1px solid #ef4444',
              borderRadius: '4px'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#cccccc' }}>
                <strong style={{ color: '#ef4444' }}>⚠️ Important:</strong>
                <p style={{ marginTop: '0.5rem', lineHeight: '1.5', color: '#aaa' }}>
                  Changing the workspaces location requires restarting the application.
                  Existing workspaces in the old location will not be automatically moved.
                </p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '0.5rem',
              marginTop: '1.5rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={onClose}
                className="button-secondary button"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="button"
                disabled={isSaving || !workspacesDirectory.trim()}
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
