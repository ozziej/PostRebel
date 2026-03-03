import React, { useState, useEffect } from 'react';
import { Collection, Environment, ApiRequest, ApiResponse, Certificate, Workspace } from './types';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ResizableSidebar } from './components/ResizableSidebar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { CertificateManager } from './components/CertificateManager';
import { EnvironmentEditor } from './components/EnvironmentEditor';
import { WorkspaceManager } from './components/WorkspaceManager';
import { SettingsModal } from './components/SettingsModal';
import { HttpService } from './utils/httpService';
import { ScriptRunner } from './utils/scriptRunner';
import './App.css';

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
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
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (activeWorkspace) {
      loadData();
    }
  }, [activeWorkspace]);

  const loadWorkspaces = async () => {
    try {
      const result = await window.electronAPI.loadWorkspaces();
      if (result.success) {
        setWorkspaces(result.workspaces);
        // Auto-select first workspace if available
        if (result.workspaces.length > 0 && !activeWorkspace) {
          setActiveWorkspace(result.workspaces[0]);
        }
      }
    } catch (error) {
      console.error('Error loading workspaces:', error);
    }
  };

  const loadData = async () => {
    try {
      const workspaceId = activeWorkspace?.id;
      const collectionsResult = await window.electronAPI.loadCollections(workspaceId);
      const environmentsResult = await window.electronAPI.loadEnvironments(workspaceId);

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
    const workspaceId = activeWorkspace?.id;
    const result = await window.electronAPI.saveCollection(workspaceId, collection);
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
    const workspaceId = activeWorkspace?.id;
    const result = await window.electronAPI.saveEnvironment(workspaceId, environment);
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

      // Also update activeEnvironment if it's the one being saved
      if (activeEnvironment?.id === environment.id) {
        setActiveEnvironment(environment);
        console.log('[App] Updated active environment:', environment.name);
      }
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

  const handleCreateWorkspace = async (name: string, description?: string) => {
    const result = await window.electronAPI.createWorkspace(name, description);
    if (result.success && result.workspace) {
      const newWorkspace = result.workspace;
      setWorkspaces(prev => [...prev, newWorkspace]);
      setActiveWorkspace(newWorkspace);
      console.log('[App] Created and switched to workspace:', newWorkspace.name);
    } else {
      throw new Error(result.error || 'Failed to create workspace');
    }
  };

  const handleUpdateWorkspace = async (workspaceId: string, name: string, description?: string) => {
    const result = await window.electronAPI.updateWorkspace(workspaceId, name, description);
    if (result.success && result.workspace) {
      const updatedWorkspace = result.workspace;
      setWorkspaces(prev => prev.map(w => w.id === workspaceId ? updatedWorkspace : w));

      // If updating the active workspace, update it
      if (activeWorkspace?.id === workspaceId) {
        setActiveWorkspace(updatedWorkspace);
      }

      console.log('[App] Updated workspace:', updatedWorkspace.name);
    } else {
      throw new Error(result.error || 'Failed to update workspace');
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const result = await window.electronAPI.deleteWorkspace(workspaceId);
    if (result.success) {
      setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
      console.log('[App] Deleted workspace:', workspaceId);
    } else {
      throw new Error(result.error || 'Failed to delete workspace');
    }
  };

  const handleSelectWorkspace = async (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    await window.electronAPI.setActiveWorkspace(workspace.id);
    console.log('[App] Switched to workspace:', workspace.name);
    // Clear current data
    setCollections([]);
    setEnvironments([]);
    setActiveEnvironment(null);
    setActiveRequest(null);
    setCurrentResponse(null);
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
      <TopBar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
        onOpenCertManager={() => setShowCertManager(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="app-body">
        <ResizableSidebar defaultWidth={300} minWidth={250} maxWidth={600}>
          <Sidebar
            activeWorkspace={activeWorkspace}
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
            onEditEnvironmentVariables={() => setShowEnvEditor(true)}
          />
        </ResizableSidebar>

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

      <WorkspaceManager
        isOpen={showWorkspaceManager}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onClose={() => setShowWorkspaceManager(false)}
        onCreateWorkspace={handleCreateWorkspace}
        onUpdateWorkspace={handleUpdateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;