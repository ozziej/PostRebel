import React, { useState, useEffect } from 'react';
import { DEFAULT_SHORTCUTS, KeyboardShortcut, formatShortcutDisplay, isValidShortcut, getShortcutConflict } from '../utils/keyboardShortcuts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [workspacesDirectory, setWorkspacesDirectory] = useState('');
  const [historyMaxPerRequest, setHistoryMaxPerRequest] = useState(10);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [shortcutInput, setShortcutInput] = useState('');
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
        setHistoryMaxPerRequest(result.settings.historyMaxPerRequest ?? 10);

        // Load shortcuts or use defaults
        const savedShortcuts = result.settings.keyboardShortcuts;
        if (savedShortcuts && Array.isArray(savedShortcuts)) {
          // Merge saved shortcuts with defaults to ensure new shortcuts are available
          const mergedShortcuts = DEFAULT_SHORTCUTS.map(defaultShortcut => {
            const saved = savedShortcuts.find((s: KeyboardShortcut) => s.id === defaultShortcut.id);
            return saved ? { ...defaultShortcut, currentKey: saved.currentKey } : defaultShortcut;
          });
          setShortcuts(mergedShortcuts);
        } else {
          setShortcuts(DEFAULT_SHORTCUTS);
        }
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

  const handleEditShortcut = (shortcutId: string) => {
    const shortcut = shortcuts.find(s => s.id === shortcutId);
    if (shortcut) {
      setEditingShortcut(shortcutId);
      setShortcutInput(shortcut.currentKey);
    }
  };

  const handleShortcutKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Build shortcut string
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('cmd');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');

    // Add key (ignore modifier keys)
    const key = e.key.toLowerCase();
    if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
      parts.push(key);
      setShortcutInput(parts.join('+'));
    }
  };

  const handleSaveShortcut = () => {
    if (!editingShortcut) return;

    if (!isValidShortcut(shortcutInput)) {
      alert('Invalid shortcut. Please use at least one modifier key (Ctrl, Cmd, Alt, Shift) plus a regular key.');
      return;
    }

    const conflict = getShortcutConflict(shortcutInput, shortcuts, editingShortcut);
    if (conflict) {
      alert(`This shortcut conflicts with "${conflict.name}". Please choose a different combination.`);
      return;
    }

    setShortcuts(prev => prev.map(s =>
      s.id === editingShortcut ? { ...s, currentKey: shortcutInput } : s
    ));
    setEditingShortcut(null);
    setShortcutInput('');
  };

  const handleCancelShortcut = () => {
    setEditingShortcut(null);
    setShortcutInput('');
  };

  const handleResetShortcut = (shortcutId: string) => {
    setShortcuts(prev => prev.map(s =>
      s.id === shortcutId ? { ...s, currentKey: s.defaultKey } : s
    ));
  };

  const handleSave = async () => {
    if (!workspacesDirectory.trim()) {
      alert('Workspaces directory is required');
      return;
    }

    setIsSaving(true);
    try {
      const settings = {
        workspacesDirectory,
        keyboardShortcuts: shortcuts
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
        borderRadius: '8px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: 'calc(100vh - 80px)', // Viewport height minus margin
        border: '1px solid #404040',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Fixed Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 2rem 1rem 2rem',
          borderBottom: '1px solid #404040',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button onClick={onClose} className="button-secondary button">
            ✗
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem 2rem'
        }}>
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

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Request History</h3>
              <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                Configure how many history entries to keep per request. Older entries are pruned when the app closes.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label style={{ whiteSpace: 'nowrap' }}>Max entries per request</label>
                <input
                  type="number"
                  value={historyMaxPerRequest}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
                    setHistoryMaxPerRequest(val);
                    window.electronAPI.savePreference('historyMaxPerRequest', val);
                  }}
                  min={1}
                  max={100}
                  className="form-input"
                  style={{ width: '80px' }}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Keyboard Shortcuts</h3>
              <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                Customize keyboard shortcuts for common actions. Click a shortcut to edit it.
              </p>

              <div style={{
                border: '1px solid #404040',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                {shortcuts.map((shortcut, index) => (
                  <div
                    key={shortcut.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      borderBottom: index < shortcuts.length - 1 ? '1px solid #404040' : 'none',
                      backgroundColor: index % 2 === 0 ? '#2a2a2a' : '#252525'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {shortcut.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#aaa' }}>
                        {shortcut.description}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {editingShortcut === shortcut.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={shortcutInput}
                            onChange={() => {}} // Controlled by keydown
                            onKeyDown={handleShortcutKeyDown}
                            placeholder="Press keys..."
                            className="form-input"
                            style={{
                              width: '150px',
                              fontSize: '0.8rem',
                              fontFamily: 'monospace',
                              backgroundColor: '#1a1a1a'
                            }}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveShortcut}
                            className="button"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                            disabled={!isValidShortcut(shortcutInput)}
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCancelShortcut}
                            className="button-secondary button"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#404040',
                              borderRadius: '4px',
                              border: '1px solid #555',
                              cursor: 'pointer',
                              minWidth: '80px',
                              textAlign: 'center'
                            }}
                            onClick={() => handleEditShortcut(shortcut.id)}
                            title="Click to edit shortcut"
                          >
                            {formatShortcutDisplay(shortcut.currentKey)}
                          </span>
                          {shortcut.currentKey !== shortcut.defaultKey && (
                            <button
                              onClick={() => handleResetShortcut(shortcut.id)}
                              className="button-secondary button"
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                              title="Reset to default"
                            >
                              ↺
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                fontSize: '0.8rem',
                color: '#888',
                padding: '0.75rem',
                backgroundColor: '#1a1a1a',
                borderRadius: '4px',
                marginTop: '0.5rem'
              }}>
                <strong>💡 Tip:</strong> Use Ctrl/Cmd + key combinations. Click any shortcut to change it.
                Shortcuts are normalized for your platform (Cmd on Mac, Ctrl on Windows/Linux).
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
          </>
          )}
        </div>

        {/* Fixed Footer */}
        {!isLoading && (
          <div style={{
            borderTop: '1px solid #404040',
            padding: '1rem 2rem',
            flexShrink: 0,
            display: 'flex',
            gap: '0.5rem',
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
        )}
      </div>
    </div>
  );
};
