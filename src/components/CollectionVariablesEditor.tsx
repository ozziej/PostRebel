import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Collection, KeyValuePair } from '../types';
import { KeyValueEditor } from './KeyValueEditor';
import { toKeyValuePairs, fromKeyValuePairs } from '../utils/variableConversion';

interface CollectionVariablesEditorProps {
  isOpen: boolean;
  collection: Collection | null;
  onClose: () => void;
  onSave: (collection: Collection) => Promise<any>;
}

export const CollectionVariablesEditor: React.FC<CollectionVariablesEditorProps> = ({
  isOpen,
  collection,
  onClose,
  onSave
}) => {
  const [variablesData, setVariablesData] = useState<KeyValuePair[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentCollection, setCurrentCollection] = useState<Collection | null>(null);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    if (isOpen && collection) {
      setCurrentCollection(collection);
      setVariablesData(toKeyValuePairs(collection.variablesArray, collection.variables));
    }
  }, [isOpen, collection]);

  const handleSave = async () => {
    if (!currentCollection) return;

    setIsSaving(true);
    try {
      const { variablesArray, variables } = fromKeyValuePairs(variablesData);

      const updatedCollection: Collection = {
        ...currentCollection,
        variables,
        variablesArray
      };

      await onSave(updatedCollection);
      triggerToast('Changes Saved');
      setTimeout(() => onClose(), 1200);
    } catch (error) {
      console.error('Failed to save collection variables:', error);
      alert('Failed to save collection variables');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVariablesChange = (data: KeyValuePair[]) => {
    setVariablesData(data);
  };

  if (!isOpen || !currentCollection) return null;

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
            <h2>Collection Variables</h2>
            <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.25rem' }}>
              {currentCollection.name}
            </div>
          </div>
          <button onClick={onClose} className="button-secondary button">✗</button>
        </div>

        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#cccccc', marginBottom: '0.5rem' }}>
            <strong>💡 How collection variables work:</strong>
          </div>
          <ul style={{ fontSize: '0.85rem', color: '#888', margin: '0.5rem 0', paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li>Read and write these from scripts with <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#0d7377' }}>pm.collectionVariables.get(key)</code> / <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#0d7377' }}>.set(key, value)</code></li>
            <li>Scoped to this collection only, shared by every request and script in it</li>
            <li>Unlike environment variables, these aren't used for <code style={{ backgroundColor: '#2d2d2d', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>{'{{variable}}'}</code> substitution in URLs/headers/bodies — they're script-only</li>
          </ul>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <KeyValueEditor
            allowSort={true}
            data={variablesData}
            onChange={handleVariablesChange}
            placeholder={{ key: 'Variable name (e.g., authToken)', value: 'Variable value' }}
            allowSecrets={true}
          />
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
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#166534',
          border: '1px solid #22c55e',
          color: '#fff',
          padding: '0.35rem 1rem',
          borderRadius: 20,
          fontSize: '0.8rem',
          fontWeight: 500,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          zIndex: 1100,
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
};
