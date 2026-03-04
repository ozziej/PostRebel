import React, { useState, useEffect } from 'react';
import { Environment, KeyValuePair } from '../types';
import { VariableInput } from './VariableInput';

interface KeyValueEditorProps {
  data: KeyValuePair[];
  onChange: (data: KeyValuePair[]) => void;
  placeholder?: { key: string; value: string };
  environment?: Environment | null;
  onUpdateVariable?: (varName: string, newValue: string) => void;
  allowSecrets?: boolean; // Show secret checkbox
}

export const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  data,
  onChange,
  placeholder = { key: 'Key', value: 'Value' },
  environment,
  onUpdateVariable,
  allowSecrets = false
}) => {
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (bulkMode) {
      // Convert data to bulk text format
      const text = data
        .map(item => `${item.key}:${item.value}`)
        .join('\n');
      setBulkText(text);
    }
  }, [bulkMode, data]);

  const handleBulkChange = (text: string) => {
    setBulkText(text);
  };

  const applyBulkEdit = () => {
    const lines = bulkText.split('\n').filter(line => line.trim());
    const newData: KeyValuePair[] = lines.map(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        return { key: line.trim(), value: '', enabled: true };
      }
      return {
        key: line.substring(0, colonIndex).trim(),
        value: line.substring(colonIndex + 1).trim(),
        enabled: true
      };
    });
    onChange(newData);
    setBulkMode(false);
  };

  const addRow = () => {
    onChange([...data, { key: '', value: '', enabled: true, isSecret: false }]);
  };

  const updateRow = (index: number, field: 'key' | 'value' | 'enabled' | 'isSecret', value: string | boolean) => {
    const newData = [...data];
    newData[index] = { ...newData[index], [field]: value };
    onChange(newData);
  };

  const deleteRow = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  if (bulkMode) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', color: '#cccccc' }}>
            Bulk Edit (format: key:value, one per line)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={applyBulkEdit} className="button" style={{ fontSize: '0.8rem' }}>
              Apply
            </button>
            <button
              onClick={() => setBulkMode(false)}
              className="button-secondary button"
              style={{ fontSize: '0.8rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
        <textarea
          className="form-textarea"
          value={bulkText}
          onChange={(e) => handleBulkChange(e.target.value)}
          placeholder="client_id:Platform-INT&#10;grant_type:password&#10;username:user@example.com"
          style={{ minHeight: '200px', fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
          Tip: Use colon (:) to separate keys and values. Each line is one parameter.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <button onClick={addRow} className="button" style={{ fontSize: '0.8rem' }}>
          + Add Parameter
        </button>
        <button
          onClick={() => setBulkMode(true)}
          className="button-secondary button"
          style={{ fontSize: '0.8rem' }}
        >
          Bulk Edit
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#666', fontSize: '0.9rem' }}>
            No parameters. Click "+ Add Parameter" or "Bulk Edit" to add.
          </div>
        ) : (
          data.map((item, index) => (
            <div key={index} style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              backgroundColor: item.isSecret ? '#2d1a1a' : 'transparent',
              padding: item.isSecret ? '0.5rem' : '0',
              borderRadius: item.isSecret ? '4px' : '0',
              border: item.isSecret ? '1px solid #ef4444' : 'none'
            }}>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => updateRow(index, 'enabled', e.target.checked)}
                style={{ cursor: 'pointer' }}
                title="Enable/disable this parameter"
              />
              <input
                type="text"
                placeholder={placeholder.key}
                value={item.key}
                onChange={(e) => updateRow(index, 'key', e.target.value)}
                className="form-input"
                style={{ flex: 1, opacity: item.enabled ? 1 : 0.5 }}
              />
              {environment ? (
                <VariableInput
                  value={item.value}
                  onChange={(value) => updateRow(index, 'value', value)}
                  environment={environment}
                  onUpdateVariable={onUpdateVariable}
                  placeholder={placeholder.value}
                  className="form-input"
                  style={{ flex: 1, opacity: item.enabled ? 1 : 0.5 }}
                />
              ) : (
                <input
                  type={item.isSecret ? 'password' : 'text'}
                  placeholder={placeholder.value}
                  value={item.value}
                  onChange={(e) => updateRow(index, 'value', e.target.value)}
                  className="form-input"
                  style={{ flex: 1, opacity: item.enabled ? 1 : 0.5 }}
                />
              )}
              {allowSecrets && (
                <button
                  onClick={() => updateRow(index, 'isSecret', !item.isSecret)}
                  className="button-secondary button"
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.3rem 0.5rem',
                    backgroundColor: item.isSecret ? '#ef4444' : '#404040'
                  }}
                  title={item.isSecret ? 'Secret (will not be committed)' : 'Mark as secret'}
                >
                  {item.isSecret ? '🔒' : '🔓'}
                </button>
              )}
              <button
                onClick={() => deleteRow(index)}
                className="button-secondary button"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                title="Delete parameter"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};