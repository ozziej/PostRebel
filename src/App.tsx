import React, { useState, useEffect } from 'react';
import { Collection, Environment, ApiRequest, ApiResponse, Certificate } from './types';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { CertificateManager } from './components/CertificateManager';
import { EnvironmentEditor } from './components/EnvironmentEditor';
import { HttpService } from './utils/httpService';
import { ScriptRunner } from './utils/scriptRunner';
import './App.css';

function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [activeEnvironment, setActiveEnvironment] = useState<Environment | null>(null);
  const [activeRequest, setActiveRequest] = useState<ApiRequest | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showCertManager, setShowCertManager] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const collectionsResult = await window.electronAPI.loadCollections(undefined);
      const environmentsResult = await window.electronAPI.loadEnvironments(undefined);

      if (collectionsResult.success) {
        setCollections(collectionsResult.collections);
      }

      if (environmentsResult.success) {
        setEnvironments(environmentsResult.environments);
        if (environmentsResult.environments.length > 0) {
          setActiveEnvironment(environmentsResult.environments[0]);
        }
      }

      // Load certificates if available
      if (window.electronAPI.loadCertificates) {
        const certificatesResult = await window.electronAPI.loadCertificates();
        if (certificatesResult.success) {
          setCertificates(certificatesResult.certificates);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const saveCollection = async (collection: Collection) => {
    const result = await window.electronAPI.saveCollection(undefined, collection);
    if (result.success) {
      setCollections(prev => {
        const index = prev.findIndex(c => c.id === collection.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = collection;
          return updated;
        } else {
          return [...prev, collection];
        }
      });
    }
    return result;
  };

  const saveEnvironment = async (environment: Environment) => {
    const result = await window.electronAPI.saveEnvironment(undefined, environment);
    if (result.success) {
      setEnvironments(prev => {
        const index = prev.findIndex(e => e.id === environment.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = environment;
          return updated;
        } else {
          return [...prev, environment];
        }
      });
    }
    return result;
  };

  const deleteCollection = async (collectionId: string) => {
    setCollections(prev => prev.filter(c => c.id !== collectionId));
    // Note: We're just removing from state. In a real app, you'd also delete the file
    return { success: true };
  };

  const deleteRequest = async (collectionId: string, requestId: string) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        return {
          ...collection,
          requests: collection.requests.filter(r => r.id !== requestId)
        };
      }
      return collection;
    }));

    // Save updated collection
    const collection = collections.find(c => c.id === collectionId);
    if (collection) {
      const updatedCollection = {
        ...collection,
        requests: collection.requests.filter(r => r.id !== requestId)
      };
      await saveCollection(updatedCollection);
    }

    return { success: true };
  };

  const deleteEnvironment = async (environmentId: string) => {
    setEnvironments(prev => prev.filter(e => e.id !== environmentId));

    // If deleting the active environment, switch to the first remaining one
    if (activeEnvironment?.id === environmentId) {
      const remainingEnvs = environments.filter(e => e.id !== environmentId);
      setActiveEnvironment(remainingEnvs.length > 0 ? remainingEnvs[0] : null);
    }

    // Note: We're just removing from state. In a real app, you'd also delete the file
    return { success: true };
  };

  const handleRequestChange = async (updatedRequest: ApiRequest) => {
    // Update the active request state
    setActiveRequest(updatedRequest);

    // Find the collection containing this request and auto-save
    const collection = collections.find(c =>
      c.requests.some(r => r.id === updatedRequest.id)
    );

    if (collection) {
      const updatedCollection = {
        ...collection,
        requests: collection.requests.map(r =>
          r.id === updatedRequest.id ? updatedRequest : r
        )
      };
      await saveCollection(updatedCollection);
      console.log('[App] Auto-saved request:', updatedRequest.name);
    }
  };

  const executeRequest = async (request: ApiRequest) => {
    if (!activeEnvironment) {
      alert('Please select an environment first');
      return;
    }

    setIsLoading(true);
    setCurrentResponse(null);
    setLogs([]);

    try {
      // Execute pre-request script
      if (request.preRequestScript) {
        const preScriptResult = ScriptRunner.executePreRequestScript(
          request.preRequestScript,
          activeEnvironment
        );
        setLogs(prev => [...prev, ...preScriptResult.logs]);

        if (!preScriptResult.success) {
          setLogs(prev => [...prev, `Pre-request script error: ${preScriptResult.error}`]);
        }
      }

      // Make the HTTP request
      const response = await HttpService.executeRequest(request, activeEnvironment, certificates);
      setCurrentResponse(response);

      // Execute test script
      if (request.testScript) {
        const testScriptResult = ScriptRunner.executeTestScript(
          request.testScript,
          response,
          activeEnvironment
        );
        setLogs(prev => [...prev, ...testScriptResult.logs]);

        if (!testScriptResult.success) {
          setLogs(prev => [...prev, `Test script error: ${testScriptResult.error}`]);
        }
      }

      setLogs(prev => [...prev, `Request completed in ${response.time}ms`]);

    } catch (error: any) {
      // If we get here, it's an unexpected error (not an HTTP error)
      setLogs(prev => [...prev, `Fatal Error: ${error.message}`]);

      // Show error in response panel
      setCurrentResponse({
        status: 0,
        statusText: 'Fatal Error',
        headers: {},
        data: {
          error: true,
          message: `An unexpected error occurred: ${error.message}`,
          stack: error.stack
        },
        time: 0,
        size: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        collections={collections}
        environments={environments}
        activeEnvironment={activeEnvironment}
        onSelectEnvironment={setActiveEnvironment}
        onSelectRequest={setActiveRequest}
        onSaveCollection={saveCollection}
        onSaveEnvironment={saveEnvironment}
        onDeleteCollection={deleteCollection}
        onDeleteRequest={deleteRequest}
        onDeleteEnvironment={deleteEnvironment}
        onOpenCertManager={() => setShowCertManager(true)}
        onEditEnvironmentVariables={() => setShowEnvEditor(true)}
      />

      <div className="main-content">
        <RequestPanel
          request={activeRequest}
          environment={activeEnvironment}
          onExecute={executeRequest}
          onRequestChange={handleRequestChange}
          isLoading={isLoading}
        />

        <ResponsePanel
          response={currentResponse}
          logs={logs}
          isLoading={isLoading}
        />
      </div>

      <CertificateManager
        isOpen={showCertManager}
        onClose={() => setShowCertManager(false)}
        onCertificatesChange={setCertificates}
      />

      <EnvironmentEditor
        isOpen={showEnvEditor}
        environment={activeEnvironment}
        onClose={() => setShowEnvEditor(false)}
        onSave={saveEnvironment}
      />
    </div>
  );
}

export default App;