import React, { useState } from 'react';
import { Collection, Environment } from '../types';
import { VariableInput } from './VariableInput';

interface CollectionAuthModalProps {
  collection: Collection | null;
  isOpen: boolean;
  environment: Environment;
  onClose: () => void;
  onSave: (collection: Collection) => Promise<any>;
  onUpdateVariable?: (key: string, value: string) => void;
}

export const CollectionAuthModal: React.FC<CollectionAuthModalProps> = ({
  collection,
  isOpen,
  environment,
  onClose,
  onSave,
  onUpdateVariable,
}) => {
  const [authConfig, setAuthConfig] = useState<Collection['auth']>(collection?.auth || { type: 'none' });
  const [isSaving, setIsSaving] = useState(false);

  // Update auth config when collection changes
  React.useEffect(() => {
    if (collection) {
      setAuthConfig(collection.auth || { type: 'none' });
    }
  }, [collection]);

  if (!isOpen || !collection) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedCollection = {
        ...collection,
        auth: authConfig?.type === 'none' ? undefined : authConfig
      };
      await onSave(updatedCollection);
      onClose();
    } catch (error) {
      console.error('Failed to save collection auth:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateAuth = (updates: any) => {
    setAuthConfig({ ...authConfig, ...updates });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '0.5rem',
        padding: '2rem',
        minWidth: '500px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1f2937'
          }}>
            Collection Authentication
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem'
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{
            margin: 0,
            color: '#6b7280',
            fontSize: '0.9rem'
          }}>
            Configure authentication for collection "<strong>{collection.name}</strong>".
            All requests set to "Inherit from Collection" will use these settings.
          </p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            color: '#374151'
          }}>
            Authentication Type
          </label>
          <select
            className="form-input"
            style={{
              fontSize: '0.9rem',
              width: '100%',
              padding: '0.75rem'
            }}
            value={authConfig?.type || 'none'}
            onChange={(e) => {
              const type = e.target.value as 'none' | 'bearer' | 'basic' | 'jwt';
              setAuthConfig(type === 'none' ? { type: 'none' } : { type });
            }}
          >
            <option value="none">No Authentication</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Authentication (Username/Password)</option>
            <option value="jwt">JWT Token</option>
          </select>
        </div>

        {authConfig?.type === 'bearer' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              color: '#374151'
            }}>
              Bearer Token
            </label>
            <VariableInput
              value={authConfig?.bearer || ''}
              onChange={(value) => updateAuth({ bearer: value })}
              environment={environment}
              onUpdateVariable={onUpdateVariable}
              placeholder="Enter bearer token or use {{variable_name}}"
              className="form-input"
              style={{
                fontSize: '0.9rem',
                width: '100%',
                padding: '0.75rem'
              }}
            />
            <small style={{
              display: 'block',
              marginTop: '0.5rem',
              color: '#6b7280',
              fontSize: '0.8rem'
            }}>
              {'Example: {{api_token}} or paste your actual token'}
            </small>
          </div>
        )}

        {authConfig?.type === 'basic' && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                color: '#374151'
              }}>
                Username
              </label>
              <VariableInput
                value={authConfig?.basic?.username || ''}
                onChange={(value) => updateAuth({
                  basic: {
                    username: value,
                    password: authConfig?.basic?.password || ''
                  }
                })}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder="Enter username or use variable like username"
                className="form-input"
                style={{
                  fontSize: '0.9rem',
                  width: '100%',
                  padding: '0.75rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                color: '#374151'
              }}>
                Password
              </label>
              <VariableInput
                value={authConfig?.basic?.password || ''}
                onChange={(value) => updateAuth({
                  basic: {
                    username: authConfig?.basic?.username || '',
                    password: value
                  }
                })}
                environment={environment}
                onUpdateVariable={onUpdateVariable}
                placeholder="Enter password or use variable like password"
                className="form-input"
                style={{
                  fontSize: '0.9rem',
                  width: '100%',
                  padding: '0.75rem'
                }}
              />
            </div>
            <small style={{
              display: 'block',
              marginBottom: '1.5rem',
              color: '#6b7280',
              fontSize: '0.8rem'
            }}>
              {'Use environment variables like {{username}} and {{password}} to keep credentials secure'}
            </small>
          </>
        )}

        {authConfig?.type === 'jwt' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              color: '#374151'
            }}>
              JWT Token
            </label>
            <VariableInput
              value={authConfig?.jwt || ''}
              onChange={(value) => updateAuth({ jwt: value })}
              environment={environment}
              onUpdateVariable={onUpdateVariable}
              placeholder="Enter JWT token or use variable like jwt_token"
              className="form-input"
              style={{
                fontSize: '0.9rem',
                width: '100%',
                padding: '0.75rem'
              }}
            />
            <small style={{
              display: 'block',
              marginTop: '0.5rem',
              color: '#6b7280',
              fontSize: '0.8rem'
            }}>
              {'Example: {{jwt_token}} or paste your actual JWT'}
            </small>
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.9rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              backgroundColor: '#fff',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.9rem',
              border: 'none',
              borderRadius: '0.375rem',
              backgroundColor: '#10b981',
              color: '#fff',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1
            }}
          >
            {isSaving ? 'Saving...' : 'Save Authentication'}
          </button>
        </div>
      </div>
    </div>
  );
};