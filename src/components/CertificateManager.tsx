import React, { useState, useEffect } from 'react';
import { Certificate } from '../types';

interface CertificateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onCertificatesChange: (certificates: Certificate[]) => void;
}

export const CertificateManager: React.FC<CertificateManagerProps> = ({
  isOpen,
  onClose,
  onCertificatesChange
}) => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCert, setNewCert] = useState({
    name: '',
    host: '',
    type: 'ca' as 'ca' | 'client',
    pemData: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadCertificates();
    }
  }, [isOpen]);

  const loadCertificates = async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.loadCertificates) {
        console.error('Certificate API not available. Make sure Electron is running.');
        return;
      }

      const result = await window.electronAPI.loadCertificates();
      if (result.success) {
        setCertificates(result.certificates);
        onCertificatesChange(result.certificates);
      }
    } catch (error) {
      console.error('Error loading certificates:', error);
    }
  };

  const handleAddCertificate = async () => {
    if (!newCert.name || !newCert.host || !newCert.pemData) {
      alert('Please fill in all fields');
      return;
    }

    // Validate PEM data
    const validation = validatePemData(newCert.pemData);
    if (!validation.valid) {
      alert(`Invalid certificate data:\n\n${validation.error}\n\nPlease check your certificate file and try again.`);
      return;
    }

    const certificate: Certificate = {
      id: Date.now().toString(),
      name: newCert.name,
      host: newCert.host,
      type: newCert.type,
      pemData: newCert.pemData
    };

    const result = await window.electronAPI.saveCertificate(certificate);
    if (result.success) {
      await loadCertificates();
      setNewCert({ name: '', host: '', type: 'ca', pemData: '' });
      setShowAddForm(false);
    } else {
      alert(`Failed to save certificate: ${result.error}`);
    }
  };

  const handleLoadFromFile = async () => {
    const result = await window.electronAPI.loadCertificateFile();
    if (result.success && result.content) {
      setNewCert(prev => ({ ...prev, pemData: result.content! }));
    } else if (result.error) {
      alert(`Failed to load certificate: ${result.error}`);
    }
  };

  const handleDeleteCertificate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this certificate?')) {
      return;
    }

    const result = await window.electronAPI.deleteCertificate(id);
    if (result.success) {
      await loadCertificates();
    } else {
      alert(`Failed to delete certificate: ${result.error}`);
    }
  };

  const validatePemData = (pemData: string): { valid: boolean; error?: string } => {
    if (!pemData.trim()) {
      return { valid: false, error: 'Certificate data is empty' };
    }

    if (!pemData.includes('-----BEGIN CERTIFICATE-----')) {
      return { valid: false, error: 'Missing BEGIN CERTIFICATE marker' };
    }

    if (!pemData.includes('-----END CERTIFICATE-----')) {
      return { valid: false, error: 'Missing END CERTIFICATE marker' };
    }

    // Check for common issues
    const lines = pemData.split('\n');
    const beginLine = lines.findIndex(l => l.includes('-----BEGIN CERTIFICATE-----'));
    const endLine = lines.findIndex(l => l.includes('-----END CERTIFICATE-----'));

    if (beginLine >= endLine) {
      return { valid: false, error: 'END marker appears before BEGIN marker' };
    }

    // Check if there's actual data between markers
    const certData = lines.slice(beginLine + 1, endLine).join('').trim();
    if (certData.length < 10) {
      return { valid: false, error: 'Certificate data appears to be empty or too short' };
    }

    // Check for valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/=\s]+$/;
    if (!base64Regex.test(certData)) {
      return { valid: false, error: 'Certificate data contains invalid characters (not valid base64)' };
    }

    return { valid: true };
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
          <h2>Certificate Manager</h2>
          <button onClick={onClose} className="button-secondary button">✗</button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => setShowAddForm(true)}
            className="button"
            disabled={showAddForm}
          >
            + Add Certificate
          </button>
        </div>

        {showAddForm && (
          <div style={{
            backgroundColor: '#1a1a1a',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            border: '1px solid #404040'
          }}>
            <h3>Add New Certificate</h3>

            <div className="form-group">
              <label>Certificate Name</label>
              <input
                type="text"
                placeholder="My Company CA"
                value={newCert.name}
                onChange={(e) => setNewCert(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Host/Domain</label>
              <input
                type="text"
                placeholder="api.company.com or * for all hosts"
                value={newCert.host}
                onChange={(e) => setNewCert(prev => ({ ...prev, host: e.target.value }))}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Certificate Type</label>
              <select
                value={newCert.type}
                onChange={(e) => setNewCert(prev => ({ ...prev, type: e.target.value as 'ca' | 'client' }))}
                className="form-input"
              >
                <option value="ca">CA Certificate</option>
                <option value="client">Client Certificate</option>
              </select>
            </div>

            <div className="form-group">
              <label>PEM Certificate Data</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button onClick={handleLoadFromFile} className="button-secondary button">
                  Load from File
                </button>
                <span style={{ fontSize: '0.8rem', color: '#666', alignSelf: 'center' }}>
                  Supports .pem, .crt, .cer files
                </span>
              </div>
              <textarea
                className="form-textarea"
                placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKoK...&#10;-----END CERTIFICATE-----"
                value={newCert.pemData}
                onChange={(e) => setNewCert(prev => ({ ...prev, pemData: e.target.value }))}
                style={{
                  minHeight: '150px',
                  fontFamily: 'monospace',
                  backgroundColor: newCert.pemData ? (validatePemData(newCert.pemData).valid ? '#1a3d1a' : '#3d1a1a') : '#1a1a1a'
                }}
              />
              {newCert.pemData && !validatePemData(newCert.pemData).valid && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem', padding: '0.5rem', backgroundColor: '#2d1a1a', borderRadius: '4px' }}>
                  ⚠️ {validatePemData(newCert.pemData).error}
                </div>
              )}
              {newCert.pemData && validatePemData(newCert.pemData).valid && (
                <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: '0.25rem', padding: '0.5rem', backgroundColor: '#1a2d1a', borderRadius: '4px' }}>
                  ✓ Certificate data looks valid
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleAddCertificate} className="button">
                Add Certificate
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewCert({ name: '', host: '', type: 'ca', pemData: '' });
                }}
                className="button-secondary button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <h3>Installed Certificates ({certificates.length})</h3>
          {certificates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No certificates installed. Add a certificate to handle HTTPS requests with custom CAs.
            </div>
          ) : (
            certificates.map(cert => (
              <div key={cert.id} style={{
                backgroundColor: '#1a1a1a',
                padding: '1rem',
                margin: '0.5rem 0',
                borderRadius: '4px',
                border: '1px solid #404040'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{cert.name}</div>
                    <div style={{ fontSize: '0.9rem', color: '#cccccc' }}>
                      Host: {cert.host} • Type: {cert.type.toUpperCase()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCertificate(cert.id)}
                    className="button-secondary button"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                  >
                    Delete
                  </button>
                </div>
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', color: '#0d7377' }}>View Certificate Data</summary>
                  <pre style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#2d2d2d',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    overflow: 'auto',
                    maxHeight: '200px'
                  }}>
                    {cert.pemData}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#1a1a1a', borderRadius: '4px', fontSize: '0.85rem', color: '#cccccc' }}>
          <strong>How to use:</strong>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
            <li>Add CA certificates for internal/self-signed HTTPS APIs</li>
            <li>Use "*" as host to apply to all domains</li>
            <li>Use specific domain (e.g., "api.company.com") for targeted trust</li>
            <li>Certificates are stored locally and never shared via git</li>
          </ul>

          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#2d2a1a', borderLeft: '3px solid #f59e0b', borderRadius: '4px' }}>
            <strong style={{ color: '#f59e0b' }}>⚠️ About Electron Certificate Warnings</strong>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', lineHeight: '1.5' }}>
              You may see errors like "Failed parsing key usage" in the app logs. These are warnings from Electron's Chromium engine
              but they won't prevent your requests from working. The app disables certificate verification for configured hosts,
              so requests will proceed despite these warnings.
            </p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', lineHeight: '1.5' }}>
              Check the Console tab after making a request to see if your certificate was matched and applied.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};