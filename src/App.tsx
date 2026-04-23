import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Collection, Environment, ApiRequest, ApiResponse, Certificate, Workspace, RequestHistoryEntry, SavedResponse } from './types';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { CollectionAuthModal } from './components/CollectionAuthModal';
import { ResizableSidebar } from './components/ResizableSidebar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { CertificateManager } from './components/CertificateManager';
import { EnvironmentEditor } from './components/EnvironmentEditor';
import { EnvironmentManager } from './components/EnvironmentManager';
import { WorkspaceManager } from './components/WorkspaceManager';
import { SettingsModal } from './components/SettingsModal';
import { ImportModal, ImportTab } from './components/ImportModal';
import { SearchBar, SearchOptions } from './components/SearchBar';
import { DEFAULT_SHORTCUTS, KeyboardShortcut, matchesShortcut } from './utils/keyboardShortcuts';
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
  const [responseCache, setResponseCache] = useState<Record<string, ApiResponse>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showCertManager, setShowCertManager] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalTab, setImportModalTab] = useState<ImportTab>('collection');
  const [showCollectionAuthModal, setShowCollectionAuthModal] = useState(false);
  const [editingCollectionAuth, setEditingCollectionAuth] = useState<Collection | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>([]);
  const [savedResponses, setSavedResponses] = useState<SavedResponse[]>([]);
  const [activeSavedResponse, setActiveSavedResponse] = useState<SavedResponse | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWords: false, useRegex: false });
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const savedPrefsRef = useRef<{ activeWorkspaceId?: string; activeEnvironmentId?: string }>({});

  useEffect(() => {
    // Load saved preferences then workspaces
    const init = async () => {
      try {
        const result = await window.electronAPI.getSettings();
        if (result.success && result.settings) {
          const s = result.settings;
          if (s.sidebarWidth) setSidebarWidth(s.sidebarWidth);

          // Load keyboard shortcuts
          if (s.keyboardShortcuts && Array.isArray(s.keyboardShortcuts)) {
            const mergedShortcuts = DEFAULT_SHORTCUTS.map(defaultShortcut => {
              const saved = s.keyboardShortcuts.find((saved: KeyboardShortcut) => saved.id === defaultShortcut.id);
              return saved ? { ...defaultShortcut, currentKey: saved.currentKey } : defaultShortcut;
            });
            setShortcuts(mergedShortcuts);
          }

          savedPrefsRef.current = {
            activeWorkspaceId: s.activeWorkspaceId,
            activeEnvironmentId: s.activeEnvironmentId,
          };
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
      loadWorkspaces();
    };
    init();
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
        // Auto-select saved workspace, or first workspace if available
        if (result.workspaces.length > 0 && !activeWorkspace) {
          const savedId = savedPrefsRef.current.activeWorkspaceId;
          const savedWorkspace = savedId
            ? result.workspaces.find((w: Workspace) => w.id === savedId)
            : undefined;
          setActiveWorkspace(savedWorkspace || result.workspaces[0]);
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
          const savedEnvId = savedPrefsRef.current.activeEnvironmentId;
          const savedEnv = savedEnvId
            ? environmentsResult.environments.find((e: Environment) => e.id === savedEnvId)
            : undefined;
          setActiveEnvironment(savedEnv || environmentsResult.environments[0]);
        }
      }

      // Load certificates if available
      if (window.electronAPI.loadCertificates) {
        const certificatesResult = await window.electronAPI.loadCertificates();
        if (certificatesResult.success) {
          setCertificates(certificatesResult.certificates);
        }
      }

      // Load history
      if (activeWorkspace) {
        const historyResult = await window.electronAPI.loadHistory(activeWorkspace.id);
        if (historyResult.success && historyResult.entries) {
          setRequestHistory(historyResult.entries);
        } else {
          setRequestHistory([]);
        }
      }

      // Load saved responses
      if (activeWorkspace) {
        const savedResult = await window.electronAPI.loadSavedResponses(activeWorkspace.id);
        if (savedResult.success && savedResult.entries) {
          setSavedResponses(savedResult.entries);
        } else {
          setSavedResponses([]);
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
    const collection = collections.find(c => c.id === collectionId);
    setCollections(prev => prev.filter(c => c.id !== collectionId));
    if (collection) {
      const workspaceId = activeWorkspace?.id;
      await window.electronAPI.deleteCollection(workspaceId, collection.name);
    }
    return { success: true };
  };

  const deleteRequest = async (collectionId: string, requestId: string) => {
    setCollections(prev => prev.map(collection => {
      if (collection.id === collectionId) {
        return {
          ...collection,
          requests: collection.requests.filter(r => r.id !== requestId),
          folders: collection.folders?.map(f => ({
            ...f,
            requests: f.requests.filter(r => r.id !== requestId),
          })),
        };
      }
      return collection;
    }));

    // Save updated collection
    const collection = collections.find(c => c.id === collectionId);
    if (collection) {
      const updatedCollection = {
        ...collection,
        requests: collection.requests.filter(r => r.id !== requestId),
        folders: collection.folders?.map(f => ({
          ...f,
          requests: f.requests.filter(r => r.id !== requestId),
        })),
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

  const handleUpdateVariable = async (varName: string, newValue: string) => {
    if (!activeEnvironment) return;
    const existsInArray = activeEnvironment.variablesArray?.some(v => v.key === varName);
    const updatedArray = existsInArray
      ? activeEnvironment.variablesArray?.map(v =>
          v.key === varName ? { ...v, value: newValue } : v
        )
      : [...(activeEnvironment.variablesArray || []), { key: varName, value: newValue, isSecret: false }];
    const updatedEnvironment: Environment = {
      ...activeEnvironment,
      variables: { ...activeEnvironment.variables, [varName]: newValue },
      variablesArray: updatedArray
    };
    await saveEnvironment(updatedEnvironment);
  };

  const handleRequestChange = async (updatedRequest: ApiRequest) => {
    // Update the active request state
    setActiveRequest(updatedRequest);

    // Find the collection containing this request (top-level or inside a folder)
    const collection = collections.find(c =>
      c.requests.some(r => r.id === updatedRequest.id) ||
      c.folders?.some(f => f.requests.some(r => r.id === updatedRequest.id))
    );

    if (collection) {
      const updatedCollection = {
        ...collection,
        requests: collection.requests.map(r =>
          r.id === updatedRequest.id ? updatedRequest : r
        ),
        folders: collection.folders?.map(f => ({
          ...f,
          requests: f.requests.map(r =>
            r.id === updatedRequest.id ? updatedRequest : r
          ),
        })),
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
    window.electronAPI.savePreference('activeWorkspaceId', workspace.id);
    console.log('[App] Switched to workspace:', workspace.name);
    // Clear current data
    setCollections([]);
    setEnvironments([]);
    setActiveEnvironment(null);
    setActiveRequest(null);
    setCurrentResponse(null);
    setResponseCache({});
    setRequestHistory([]);
    setSavedResponses([]);
    setActiveSavedResponse(null);
  };

  const handleCreateEnvironment = async (name: string) => {
    const newEnvironment: Environment = {
      id: Date.now().toString(),
      name: name,
      variables: {},
      variablesArray: []
    };

    const result = await saveEnvironment(newEnvironment);
    if (result.success) {
      setActiveEnvironment(newEnvironment);
      console.log('[App] Created and switched to environment:', newEnvironment.name);
    } else {
      throw new Error(result.error || 'Failed to create environment');
    }
  };

  const handleUpdateEnvironment = async (environmentId: string, name: string) => {
    const environment = environments.find(e => e.id === environmentId);
    if (!environment) {
      throw new Error('Environment not found');
    }

    const updatedEnvironment: Environment = {
      ...environment,
      name: name
    };

    const result = await saveEnvironment(updatedEnvironment);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update environment');
    }
    console.log('[App] Updated environment:', updatedEnvironment.name);
  };

  const handleDeleteEnvironment = async (environmentId: string) => {
    await deleteEnvironment(environmentId);
  };

  const handleEditEnvironmentVariables = (environment: Environment) => {
    setActiveEnvironment(environment);
    setShowEnvEditor(true);
    setShowEnvManager(false);
  };

  const handleSelectEnvironment = useCallback((env: Environment) => {
    setActiveEnvironment(env);
    window.electronAPI.savePreference('activeEnvironmentId', env.id);
  }, []);

  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
    window.electronAPI.savePreference('sidebarWidth', width);
  }, []);

  const handleSearch = (term: string, options: SearchOptions) => {
    setSearchTerm(term);
    setSearchOptions(options);
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchTerm('');
  };

  const openImportModal = (tab: ImportTab = 'collection') => {
    setImportModalTab(tab);
    setShowImportModal(true);
  };

  const handleImportCollection = async (collection: Collection, collectionVariables?: Environment) => {
    await saveCollection(collection);
    // Auto-expand the imported collection in sidebar
    if (collectionVariables) {
      await saveEnvironment(collectionVariables);
    }
    console.log('[App] Imported collection:', collection.name, `(${collection.requests.length} requests)`);
  };

  const handleImportEnvironment = async (environment: Environment) => {
    await saveEnvironment(environment);
    setActiveEnvironment(environment);
    console.log('[App] Imported environment:', environment.name);
  };

  const handleEditCollectionAuth = (collection: Collection) => {
    setEditingCollectionAuth(collection);
    setShowCollectionAuthModal(true);
  };

  const handleCloseCollectionAuthModal = () => {
    setShowCollectionAuthModal(false);
    setEditingCollectionAuth(null);
  };

  const handleImportCurl = async (
    request: ApiRequest,
    collectionId: string | null,
    newCollectionName?: string
  ) => {
    if (collectionId) {
      // Add to existing collection
      const collection = collections.find(c => c.id === collectionId);
      if (collection) {
        const updated = {
          ...collection,
          requests: [...collection.requests, request],
        };
        await saveCollection(updated);
      }
    } else {
      // Create new collection
      const newCollection: Collection = {
        id: Date.now().toString(),
        name: newCollectionName || request.name || 'Imported from cURL',
        requests: [request],
      };
      await saveCollection(newCollection);
    }
    handleSelectRequest(request);
    console.log('[App] Imported curl request:', request.name);
  };

  const handleImportOpenApi = async (
    importedCollection: Collection,
    targetCollectionId: string | null,
    newCollectionName?: string,
  ) => {
    if (targetCollectionId) {
      const target = collections.find(c => c.id === targetCollectionId);
      if (target) {
        const merged: Collection = {
          ...target,
          requests: [...target.requests, ...importedCollection.requests],
          folders: [...(target.folders || []), ...(importedCollection.folders || [])],
        };
        await saveCollection(merged);
      }
    } else {
      const newCollection: Collection = {
        ...importedCollection,
        id: Date.now().toString(),
        name: newCollectionName || importedCollection.name,
      };
      await saveCollection(newCollection);
    }
    console.log('[App] Imported OpenAPI collection:', importedCollection.name);
  };

  const handleSelectRequest = (request: ApiRequest) => {
    setActiveSavedResponse(null);
    setActiveRequest(request);
    setCurrentResponse(responseCache[request.id] ?? null);
  };

  const handleSelectSavedResponse = (saved: SavedResponse) => {
    setActiveSavedResponse(saved);
    setActiveRequest(saved.request);
    setCurrentResponse(saved.response);
  };

  const handleSaveSavedResponse = async (name: string) => {
    if (!activeWorkspace || !activeRequest || !currentResponse) return;
    const entry: SavedResponse = {
      id: Date.now().toString(),
      name,
      requestId: activeRequest.id,
      timestamp: new Date().toISOString(),
      request: activeRequest,
      response: currentResponse,
    };
    await window.electronAPI.saveSavedResponse(activeWorkspace.id, entry);
    setSavedResponses(prev => [...prev, entry]);
  };

  const handleDeleteSavedResponse = async (entryId: string) => {
    if (!activeWorkspace) return;
    await window.electronAPI.deleteSavedResponse(activeWorkspace.id, entryId);
    setSavedResponses(prev => prev.filter(e => e.id !== entryId));
    if (activeSavedResponse?.id === entryId) {
      setActiveSavedResponse(null);
    }
  };

  const handleRenameSavedResponse = async (entryId: string, newName: string) => {
    if (!activeWorkspace) return;
    await window.electronAPI.renameSavedResponse(activeWorkspace.id, entryId, newName);
    setSavedResponses(prev => prev.map(e => e.id === entryId ? { ...e, name: newName } : e));
    if (activeSavedResponse?.id === entryId) {
      setActiveSavedResponse(prev => prev ? { ...prev, name: newName } : null);
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
      const activeCollection = collections.find(c =>
        c.requests.some(r => r.id === request.id) ||
        c.folders?.some(f => f.requests.some(r => r.id === request.id))
      ) || null;
      const response = await HttpService.executeRequest(request, activeEnvironment, certificates, activeCollection);
      setCurrentResponse(response);
      setResponseCache(prev => ({ ...prev, [request.id]: response }));

      // Log history entry
      if (activeWorkspace) {
        const resolvedUrl = request.url.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
          return activeEnvironment.variables[varName] || match;
        });
        const entry: RequestHistoryEntry = {
          id: Date.now().toString(),
          requestId: request.id,
          timestamp: new Date().toISOString(),
          method: request.method,
          url: resolvedUrl,
          status: response.status,
          statusText: response.statusText,
          time: response.time,
          size: response.size,
        };
        window.electronAPI.saveHistoryEntry(activeWorkspace.id, entry);
        setRequestHistory(prev => [entry, ...prev]);
      }

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
      const errorResponse: ApiResponse = {
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
      };
      setCurrentResponse(errorResponse);
      setResponseCache(prev => ({ ...prev, [request.id]: errorResponse }));

      // Log error to history
      if (activeWorkspace && activeEnvironment) {
        const resolvedUrl = request.url.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
          return activeEnvironment.variables[varName] || match;
        });
        const entry: RequestHistoryEntry = {
          id: Date.now().toString(),
          requestId: request.id,
          timestamp: new Date().toISOString(),
          method: request.method,
          url: resolvedUrl,
          status: 0,
          statusText: 'Fatal Error',
          time: 0,
          size: 0,
        };
        window.electronAPI.saveHistoryEntry(activeWorkspace.id, entry);
        setRequestHistory(prev => [entry, ...prev]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      const searchShortcut = shortcuts.find(s => s.id === 'open-search');
      const sendShortcut = shortcuts.find(s => s.id === 'send-request');

      // Open search shortcut
      if (searchShortcut && matchesShortcut(e, searchShortcut.currentKey)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Send request shortcut (only when there's an active request and not loading)
      if (sendShortcut && matchesShortcut(e, sendShortcut.currentKey)) {
        if (activeRequest && !isLoading && activeEnvironment) {
          e.preventDefault();
          executeRequest(activeRequest);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, activeRequest, isLoading, activeEnvironment, executeRequest]);

  return (
    <div className="app">
      <TopBar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        environments={environments}
        activeEnvironment={activeEnvironment}
        onSelectWorkspace={handleSelectWorkspace}
        onSelectEnvironment={handleSelectEnvironment}
        onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
        onOpenEnvironmentManager={() => setShowEnvManager(true)}
        onOpenCertManager={() => setShowCertManager(true)}
        onOpenImport={() => openImportModal('collection')}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SearchBar
        isOpen={isSearchOpen}
        onClose={handleCloseSearch}
        onSearch={handleSearch}
      />

      <div className="app-body">
        <ResizableSidebar defaultWidth={sidebarWidth} minWidth={250} maxWidth={600} onWidthChange={handleSidebarWidthChange}>
          <Sidebar
            activeWorkspace={activeWorkspace}
            collections={collections}
            savedResponses={savedResponses}
            activeSavedResponse={activeSavedResponse}
            onSelectRequest={handleSelectRequest}
            onSelectSavedResponse={handleSelectSavedResponse}
            onDeleteSavedResponse={handleDeleteSavedResponse}
            onRenameSavedResponse={handleRenameSavedResponse}
            onSaveCollection={saveCollection}
            onDeleteCollection={deleteCollection}
            onDeleteRequest={deleteRequest}
            onEditCollectionAuth={handleEditCollectionAuth}
          />
        </ResizableSidebar>

        <div className="main-content">
        <RequestPanel
          request={activeRequest}
          environment={activeEnvironment}
          activeCollection={collections.find(c =>
            c.requests.some(r => r.id === activeRequest?.id) ||
            c.folders?.some(f => f.requests.some(r => r.id === activeRequest?.id))
          ) || null}
          onExecute={executeRequest}
          onRequestChange={handleRequestChange}
          onUpdateVariable={handleUpdateVariable}
          isLoading={isLoading}
          requestHistory={requestHistory}
          isReadOnly={activeSavedResponse !== null}
          searchTerm={searchTerm}
          searchOptions={searchOptions}
        />

        <ResponsePanel
          response={currentResponse}
          logs={logs}
          isLoading={isLoading}
          activeSavedResponse={activeSavedResponse}
          onSaveResponse={handleSaveSavedResponse}
          searchTerm={searchTerm}
          searchOptions={searchOptions}
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

      <EnvironmentManager
        isOpen={showEnvManager}
        environments={environments}
        activeEnvironment={activeEnvironment}
        onClose={() => setShowEnvManager(false)}
        onCreateEnvironment={handleCreateEnvironment}
        onUpdateEnvironment={handleUpdateEnvironment}
        onDeleteEnvironment={handleDeleteEnvironment}
        onSelectEnvironment={handleSelectEnvironment}
        onEditVariables={handleEditEnvironmentVariables}
        onOpenImport={() => openImportModal('environment')}
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

      <ImportModal
        isOpen={showImportModal}
        initialTab={importModalTab}
        collections={collections}
        onClose={() => setShowImportModal(false)}
        onImportCollection={handleImportCollection}
        onImportEnvironment={handleImportEnvironment}
        onImportCurl={handleImportCurl}
        onImportOpenApi={handleImportOpenApi}
      />

      <CollectionAuthModal
        collection={editingCollectionAuth}
        isOpen={showCollectionAuthModal}
        environment={activeEnvironment || { id: '', name: '', variables: {} }}
        onClose={handleCloseCollectionAuthModal}
        onSave={saveCollection}
        onUpdateVariable={handleUpdateVariable}
      />
    </div>
  );
}

export default App;