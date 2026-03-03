import React, { useState, useEffect } from 'react';
import { Environment, EnvironmentVariable, KeyValuePair } from '../types';
import { KeyValueEditor } from './KeyValueEditor';

interface EnvironmentEditorProps {
  isOpen: boolean;
  environment: Environment | null;
  onClose: () => void;
  onSave: (environment: Environment) => Promise<any>;
}

export const EnvironmentEditor: React.FC<EnvironmentEditorProps> = ({
  isOpen,
  environment,
  onClose,
  onSave
}) => {
  const [variablesData, setVariablesData] = useState<KeyValuePair[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentEnv, setCurrentEnv] = useState<Environment | null>(null);

  useEffect(() => {
    if (isOpen && environment) {
      setCurrentEnv(environment);

      // Convert environment to variablesData
      // Check if it has variablesArray (new format) or variables (old format)
      if (environment.variablesArray && environment.variablesArray.length > 0) {
        // New format with secrets support
        setVariablesData(environment.variablesArray.map(v => ({
          key: v.key,
          value: v.value,
          enabled: true,
          isSecret: v.isSecret
        })));
      } else if (environment.variables && Object.keys(environment.variables).length > 0) {
        // Old format - convert to new format
        setVariablesData(Object.entries(environment.variables).map(([key, value]) => ({
          key,
          value,
          enabled: true,
          isSecret: false
        })));
      } else {
        // Empty - start with one empty row
        setVariablesData([{ key: '', value: '', enabled: true, isSecret: false }]);
      }
    }
  }, [isOpen, environment]);

  const handleSave = async () => {
    if (!currentEnv) return;

    setIsSaving(true);
    try {
      // Convert variablesData back to Environment format
      const variablesArray: EnvironmentVariable[] = variablesData
        .filter(item => item.key.trim() !== '') // Only save non-empty keys
        .map(item => ({
          key: item.key,
          value: item.value,
          isSecret: item.isSecret || false
        }));

      // Also maintain legacy variables format for backward compatibility
      const variables: Record<string, string> = {};
      variablesArray.forEach(v => {
        variables[v.key] = v.value;
      });

      const updatedEnv: Environment = {
        ...currentEnv,
        variables,
        variablesArray
      };

      console.log('[EnvironmentEditor] Saving environment:', updatedEnv);
      await onSave(updatedEnv);
      onClose();
    } catch (error) {
      console.error('Failed to save environment:', error);
      alert('Failed to save environment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVariablesChange = (data: KeyValuePair[]) => {
    console.log('[EnvironmentEditor] Variables changed:', data);
    setVariablesData(data);
  };

  if (!isOpen || !currentEnv) return null;

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
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid #404040'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2>Environment Variables</h2>
            <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.25rem' }}>
              {currentEnv.name}
            </div>
          </div>
          <button onClick={onClose} className="button-secondary button">✗</button>
        </div>

        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#cccccc', marginBottom: '0.5rem' }}>
            <strong>💡 How to use variables:</strong>
          </div>
          <ul style={{ fontSize: '0.85rem', color: '#888', margin: '0.5rem 0', paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li>Use <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#0d7377' }}>{'{{variable_name}}'}</code> anywhere in your requests</li>
            <li>Works in: URLs, headers, body, form parameters, authentication</li>
            <li>Example: <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>https://{'{{environment}}'}.company.com/api</code></li>
            <li>Hover over variables in the UI to see their current values</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <KeyValueEditor
            data={variablesData}
            onChange={handleVariablesChange}
            placeholder={{ key: 'Variable name (e.g., api_key)', value: 'Variable value' }}
            allowSecrets={true}
          />
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#1a2d1a', borderRadius: '4px', border: '1px solid #0d7377' }}>
          <div style={{ fontSize: '0.85rem', color: '#cccccc' }}>
            <strong style={{ color: '#10b981' }}>🔒 Security Tip:</strong>
            <p style={{ marginTop: '0.5rem', lineHeight: '1.5', color: '#888' }}>
              Store sensitive values (passwords, API keys, tokens) in separate <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>*.local.json</code> files
              which are automatically excluded from git. Your team can share variable names while keeping values private.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
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
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#666', borderTop: '1px solid #404040', paddingTop: '1rem' }}>
          <strong>Common Variables:</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {['api_key', 'auth_token', 'base_url', 'environment', 'username', 'password'].map(varName => (
              <code
                key={varName}
                style={{
                  backgroundColor: '#2d2d2d',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  border: '1px solid #404040'
                }}
                onClick={() => {
                  // Check if variable already exists
                  const exists = variablesData.some(v => v.key === varName);
                  if (!exists) {
                    setVariablesData([...variablesData, {
                      key: varName,
                      value: '',
                      enabled: true,
                      isSecret: false
                    }]);
                  }
                }}
                title={`Click to add ${varName}`}
              >
                {varName}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};