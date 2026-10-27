import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Collection, Environment, ApiRequest, ApiResponse, Certificate, Workspace, RequestHistoryEntry, SavedResponse, Runner, RunnerLogEntry } from './types';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { CollectionAuthModal } from './components/CollectionAuthModal';
import { CollectionVariablesEditor } from './components/CollectionVariablesEditor';
import { ResizableSidebar } from './components/ResizableSidebar';
import { RequestPanel } from './components/RequestPanel';
import { ResponsePanel } from './components/ResponsePanel';
import { CertificateManager } from './components/CertificateManager';
import { EnvironmentEditor } from './components/EnvironmentEditor';
import { EnvironmentManager } from './components/EnvironmentManager';
import { EnvironmentDiff } from './components/EnvironmentDiff';
import { WorkspaceManager } from './components/WorkspaceManager';
import { SettingsModal } from './components/SettingsModal';
import { ImportModal, ImportTab } from './components/ImportModal';
import { CopyToWorkspaceModal } from './components/CopyToWorkspaceModal';
import { SearchBar, SearchOptions } from './components/SearchBar';
import { DEFAULT_SHORTCUTS, KeyboardShortcut, matchesShortcut } from './utils/keyboardShortcuts';
import { HttpService } from './utils/httpService';
import { ScriptRunner } from './utils/scriptRunner';
import { appendLogEntry } from './utils/consoleLog';
import { appendToFolder, withFreshIds, collectionContainsRequest, findRequestById, flattenRequests, removeRequestById, updateRequestById } from './utils/collectionTree';
import { MainTab, WorkspaceTabSnapshot, closeTab, moveTab, openOrFocusTab, removeMatchingTabs, sanitizeWorkspaceTabs, tabKey, tabsStillPresent } from './utils/mainTabs';
import { RequestWindowTabs, WindowTabItem } from './components/RequestWindowTabs';
import { computeOpenApiDrift, applyOpenApiDrift } from './utils/openApiDrift';
import './App.css';

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [activeEnvironment, setActiveEnvironment] = useState<Environment | null>(null);
  const [activeRequest, setActiveRequest] = useState<ApiRequest | null>(null);
  const [openTabs, setOpenTabs] = useState<MainTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ApiResponse | null>(null);
  const [responseCache, setResponseCache] = useState<Record<string, ApiResponse>>({});
  const [loadingRequestId, setLoadingRequestId] = useState<string | null>(null);
  const [testResultsByRequest, setTestResultsByRequest] = useState<Record<string, Array<{ name: string; passed: boolean; error?: string }>>>({});
  // Persistent, app-wide console log — accumulates across every ad-hoc
  // request sent this session (not reset per-request), like a DevTools console.
  const [consoleLog, setConsoleLog] = useState<RunnerLogEntry[]>([]);
  const appendConsoleLog = useCallback((level: RunnerLogEntry['level'], message: string) => {
    setConsoleLog(prev => appendLogEntry(prev, level, message));
  }, []);
  const [testResults, setTestResults] = useState<Array<{ name: string; passed: boolean; error?: string }>>([]);
  const [showCertManager, setShowCertManager] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [showEnvDiff, setShowEnvDiff] = useState(false);
  const [envDiffSource, setEnvDiffSource] = useState<Environment | null>(null);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalTab, setImportModalTab] = useState<ImportTab>('collection');
  const [showCollectionAuthModal, setShowCollectionAuthModal] = useState(false);
  const [editingCollectionAuth, setEditingCollectionAuth] = useState<Collection | null>(null);
  const [showCollectionVariablesModal, setShowCollectionVariablesModal] = useState(false);
  const [editingCollectionVariables, setEditingCollectionVariables] = useState<Collection | null>(null);
  const [copyToWorkspaceRequest, setCopyToWorkspaceRequest] = useState<ApiRequest | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>([]);
  const [savedResponses, setSavedResponses] = useState<SavedResponse[]>([]);
  const [activeSavedResponse, setActiveSavedResponse] = useState<SavedResponse | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [activeRunner, setActiveRunner] = useState<Runner | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWords: false, useRegex: false });
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [totalMatchCount, setTotalMatchCount] = useState(0);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const savedPrefsRef = useRef<{ activeWorkspaceId?: string; activeEnvironmentId?: string }>({});
  // Open tabs live in Electron userData (settings.json), not in the workspace git repo.
  const workspaceTabsRef = useRef<Record<string, WorkspaceTabSnapshot>>({});
  const tabsReadyRef = useRef(false);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  // Which workspace this window was opened with, and which other windows already show.
  const windowContextRef = useRef<{ workspaceId: string | null; openWorkspaceIds: string[] }>({ workspaceId: null, openWorkspaceIds: [] });
  const showMainTabRef = useRef<(tab: MainTab | null, overrides?: { request?: ApiRequest; runner?: Runner }) => void>(() => {});
  const activeRequestIdRef = useRef<string | null>(null);
  const viewingSavedRef = useRef(false);
  const activeRunnerIdRef = useRef<string | null>(null);
  const loadingRequestIdRef = useRef<string | null>(null);
  activeWorkspaceIdRef.current = activeWorkspace?.id ?? null;
  activeRequestIdRef.current = activeRequest?.id ?? null;
  viewingSavedRef.current = activeSavedResponse !== null;
  activeRunnerIdRef.current = activeRunner?.id ?? null;

  useEffect(() => {
    // Load saved preferences then workspaces
    const init = async () => {
      try {
        const context = await window.electronAPI.getWindowContext();
        if (context.success) {
          windowContextRef.current = { workspaceId: context.workspaceId, openWorkspaceIds: context.openWorkspaceIds };
        }
      } catch (error) {
        console.error('Error loading window context:', error);
      }
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
          workspaceTabsRef.current = sanitizeWorkspaceTabs(s.workspaceTabs);
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

  // The window title follows the workspace, so two windows can be told apart.
  useEffect(() => {
    document.title = activeWorkspace ? `PostRebel — ${activeWorkspace.name}` : 'PostRebel';
  }, [activeWorkspace]);

  useEffect(() => {
    if (!tabsReadyRef.current || !activeWorkspace) return;
    const snapshot: WorkspaceTabSnapshot = { tabs: openTabs, activeKey: activeTabKey };
    const current = workspaceTabsRef.current[activeWorkspace.id];
    if (
      current &&
      current.activeKey === snapshot.activeKey &&
      JSON.stringify(current.tabs) === JSON.stringify(snapshot.tabs)
    ) {
      return;
    }
    const next = { ...workspaceTabsRef.current, [activeWorkspace.id]: snapshot };
    workspaceTabsRef.current = next;
    window.electronAPI.saveWorkspaceTabs(activeWorkspace.id, snapshot);
  }, [openTabs, activeTabKey, activeWorkspace]);

  const loadWorkspaces = async () => {
    try {
      const result = await window.electronAPI.loadWorkspaces();
      if (result.success) {
        setWorkspaces(result.workspaces);
        // Auto-select this window's workspace, else the saved one, else the first one not open in another window
        if (result.workspaces.length > 0 && !activeWorkspace) {
          const { workspaceId: windowWorkspaceId, openWorkspaceIds } = windowContextRef.current;
          const preferredId = windowWorkspaceId ?? savedPrefsRef.current.activeWorkspaceId;
          const isFree = (w: Workspace) => !openWorkspaceIds.includes(w.id);
          const initial = result.workspaces.find((w: Workspace) => w.id === preferredId && isFree(w))
            ?? result.workspaces.find(isFree);
          if (initial) {
            const registered = await window.electronAPI.setActiveWorkspace(initial.id);
            if (registered.success) setActiveWorkspace(initial);
          }
        }
      }
    } catch (error) {
      console.error('Error loading workspaces:', error);
    }
  };

  const loadData = async () => {
    const workspaceId = activeWorkspace?.id;
    try {
      const collectionsResult = await window.electronAPI.loadCollections(workspaceId);
      const environmentsResult = await window.electronAPI.loadEnvironments(workspaceId);
      const certificatesResult = window.electronAPI.loadCertificates
        ? await window.electronAPI.loadCertificates()
        : null;
      const historyResult = workspaceId ? await window.electronAPI.loadHistory(workspaceId) : null;
      const savedResult = workspaceId ? await window.electronAPI.loadSavedResponses(workspaceId) : null;
      const runnersResult = workspaceId ? await window.electronAPI.loadRunners(workspaceId) : null;

      if (activeWorkspaceIdRef.current !== (workspaceId ?? null)) return;

      const loadedCollections: Collection[] = collectionsResult.success ? collectionsResult.collections : [];
      if (collectionsResult.success) {
        setCollections(loadedCollections);
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

      if (certificatesResult?.success) {
        setCertificates(certificatesResult.certificates);
      }

      if (workspaceId) {
        setRequestHistory(historyResult?.success && historyResult.entries ? historyResult.entries : []);
        setSavedResponses(savedResult?.success && savedResult.entries ? savedResult.entries : []);
        const loadedRunners: Runner[] = runnersResult?.success ? (runnersResult.runners || []) : [];
        setRunners(loadedRunners);

        if (collectionsResult.success && runnersResult?.success) {
          const requestIds = new Set(loadedCollections.flatMap(collection => flattenRequests(collection).map(request => request.id)));
          const runnerIds = new Set(loadedRunners.map(runner => runner.id));
          const savedTabs = workspaceTabsRef.current[workspaceId];
          const tabs = tabsStillPresent(savedTabs?.tabs || [], requestIds, runnerIds);
          const active = tabs.find(tab => tabKey(tab) === savedTabs?.activeKey) ?? tabs[tabs.length - 1] ?? null;
          setOpenTabs(tabs);
          tabsReadyRef.current = true;
          if (active?.kind === 'request') {
            let request: ApiRequest | undefined;
            for (const collection of loadedCollections) {
              request = findRequestById(collection, active.id);
              if (request) break;
            }
            showMainTabRef.current(active, { request });
          } else if (active?.kind === 'runner') {
            showMainTabRef.current(active, { runner: loadedRunners.find(runner => runner.id === active.id) });
          } else {
            showMainTabRef.current(null);
          }
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
      const requestIds = new Set(flattenRequests(collection).map(request => request.id));
      const runnerIds = new Set(runners.filter(runner => runner.collectionId === collectionId).map(runner => runner.id));
      const removed = removeMatchingTabs(openTabs, activeTabKey, tab =>
        (tab.kind === 'request' && requestIds.has(tab.id)) ||
        (tab.kind === 'runner' && runnerIds.has(tab.id))
      );
      setOpenTabs(removed.tabs);
      const savedWasRemoved = !!activeSavedResponse && requestIds.has(activeSavedResponse.requestId);
      if (removed.activeRemoved || savedWasRemoved) {
        showMainTab(removed.active);
      }
    }
    return { success: true };
  };

  const deleteRequest = async (collectionId: string, requestId: string) => {
    setCollections(prev => prev.map(collection =>
      collection.id === collectionId ? removeRequestById(collection, requestId) : collection
    ));

    // Save updated collection
    const collection = collections.find(c => c.id === collectionId);
    if (collection) {
      await saveCollection(removeRequestById(collection, requestId));
    }

    const closing: MainTab = { kind: 'request', id: requestId };
    const closed = closeTab(openTabs, closing);
    if (closed.tabs.length !== openTabs.length) {
      setOpenTabs(closed.tabs);
    }
    const wasActive = activeTabKey === tabKey(closing);
    const savedWasThis = activeSavedResponse?.requestId === requestId;
    if (wasActive || savedWasThis) {
      if (wasActive) {
        showMainTab(closed.neighbor);
      } else if (savedWasThis) {
        const current = openTabs.find(tab => tabKey(tab) === activeTabKey) ?? null;
        showMainTab(current);
      }
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
    // Find the collection containing this request, at any depth
    const collection = collections.find(c => collectionContainsRequest(c, updatedRequest.id));

    // Preserve the name from the collection's current state.
    // Renames go through the sidebar directly (onSaveCollection) and don't update
    // activeRequest/localRequest, so updatedRequest.name may be stale. Always
    // prefer the name already stored in the collection to avoid overwriting it.
    const currentInCollection = collection && findRequestById(collection, updatedRequest.id);

    const merged = currentInCollection
      ? { ...updatedRequest, name: currentInCollection.name }
      : updatedRequest;

    setActiveRequest(merged);

    if (collection) {
      await saveCollection(updateRequestById(collection, merged.id, () => merged));
      console.log('[App] Auto-saved request:', merged.name);
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

  const handleImportWorkspace = async () => {
    const fileResult = await window.electronAPI.selectJsonFile();
    if (!fileResult.success || !fileResult.content) {
      return; // user cancelled the file picker
    }

    const result = await window.electronAPI.importWorkspace(fileResult.content);
    if (result.success && result.workspace) {
      const importedWorkspace = result.workspace;
      setWorkspaces(prev => [...prev, importedWorkspace]);
      setActiveWorkspace(importedWorkspace);
      console.log('[App] Imported and switched to workspace:', importedWorkspace.name);
    } else {
      throw new Error(result.error || 'Failed to import workspace');
    }
  };

  const handleSelectWorkspace = async (workspace: Workspace) => {
    // The main process refuses a workspace that another window already shows, and focuses that window instead.
    const registered = await window.electronAPI.setActiveWorkspace(workspace.id);
    if (!registered.success) {
      console.log('[App] Workspace is open in another window:', workspace.name);
      return;
    }
    if (activeWorkspace && activeWorkspace.id !== workspace.id) {
      const snapshot: WorkspaceTabSnapshot = { tabs: openTabs, activeKey: activeTabKey };
      workspaceTabsRef.current = { ...workspaceTabsRef.current, [activeWorkspace.id]: snapshot };
      window.electronAPI.saveWorkspaceTabs(activeWorkspace.id, snapshot);
    }
    // Other windows may have saved this workspace's tabs since this window loaded settings.
    const fresh = await window.electronAPI.getSettings();
    if (fresh.success && fresh.settings) {
      const storedTabs = sanitizeWorkspaceTabs(fresh.settings.workspaceTabs)[workspace.id];
      const next = { ...workspaceTabsRef.current };
      if (storedTabs) next[workspace.id] = storedTabs;
      else delete next[workspace.id];
      workspaceTabsRef.current = next;
    }
    tabsReadyRef.current = false;
    setActiveWorkspace(workspace);
    console.log('[App] Switched to workspace:', workspace.name);
    // Clear current data. The next load restores this workspace's saved tabs.
    setCollections([]);
    setEnvironments([]);
    setActiveEnvironment(null);
    setActiveRequest(null);
    setOpenTabs([]);
    setActiveTabKey(null);
    setCurrentResponse(null);
    setResponseCache({});
    setTestResults([]);
    setTestResultsByRequest({});
    setLoadingRequestId(null);
    loadingRequestIdRef.current = null;
    setRequestHistory([]);
    setSavedResponses([]);
    setActiveSavedResponse(null);
    setRunners([]);
    setActiveRunner(null);
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

  const handleDuplicateEnvironment = async (environment: Environment) => {
    const duplicated: Environment = {
      ...environment,
      id: Date.now().toString(),
      name: `${environment.name} (copy)`,
    };
    await saveEnvironment(duplicated);
  };

  const handleCompareEnvironment = (environment: Environment) => {
    setEnvDiffSource(environment);
    setShowEnvDiff(true);
  };

  const handleDeleteEnvironment = async (environmentId: string) => {
    await deleteEnvironment(environmentId);
  };

  const handleEditEnvironmentVariables = (environment: Environment) => {
    setActiveEnvironment(environment);
    setShowEnvEditor(true);
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
    setActiveMatchIndex(0);
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchTerm('');
    setActiveMatchIndex(0);
    setTotalMatchCount(0);
  };

  const handlePreviousMatch = () => {
    if (totalMatchCount === 0) return;
    setActiveMatchIndex(i => (i - 1 + totalMatchCount) % totalMatchCount);
  };

  const handleNextMatch = () => {
    if (totalMatchCount === 0) return;
    setActiveMatchIndex(i => (i + 1) % totalMatchCount);
  };

  // Clamp active index when the match count changes (e.g. switching response tabs)
  useEffect(() => {
    if (totalMatchCount > 0 && activeMatchIndex >= totalMatchCount) {
      setActiveMatchIndex(0);
    }
  }, [totalMatchCount]);

  const openImportModal = (tab: ImportTab = 'collection') => {
    setImportModalTab(tab);
    setShowImportModal(true);
  };

  const handleImportCollection = async (
    collection: Collection,
    collectionVariables?: Environment,
    targetCollectionId?: string | null,
    folderId?: string | null
  ) => {
    const target = targetCollectionId ? collections.find(c => c.id === targetCollectionId) : undefined;
    if (target) {
      // Merge the imported folders and requests into the chosen folder, with fresh ids.
      // The imported collection's own collection-level auth and variables are not merged.
      const content = withFreshIds({ requests: collection.requests, folders: collection.folders || [] });
      await saveCollection(appendToFolder(target, folderId ?? null, content));
      if (collectionVariables) {
        await saveEnvironment(collectionVariables);
      }
      console.log('[App] Merged collection into', target.name, `(${collection.requests.length} requests)`);
      return;
    }
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

  const handleEditCollectionVariables = (collection: Collection) => {
    setEditingCollectionVariables(collection);
    setShowCollectionVariablesModal(true);
  };

  const handleCloseCollectionVariablesModal = () => {
    setShowCollectionVariablesModal(false);
    setEditingCollectionVariables(null);
  };

  const handleImportCurl = async (
    request: ApiRequest,
    collectionId: string | null,
    newCollectionName?: string,
    folderId?: string | null
  ) => {
    if (collectionId) {
      // Add to existing collection, in the chosen folder (or its root)
      const collection = collections.find(c => c.id === collectionId);
      if (collection) {
        await saveCollection(appendToFolder(collection, folderId ?? null, { requests: [request] }));
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
    removeKeys?: string[],
  ) => {
    if (targetCollectionId) {
      const target = collections.find(c => c.id === targetCollectionId);
      if (target) {
        const drift = computeOpenApiDrift(target, importedCollection);
        const merged = applyOpenApiDrift(target, drift, new Set(removeKeys || []));
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

  const findOpenRequest = (requestId: string): ApiRequest | undefined => {
    for (const collection of collections) {
      const found = findRequestById(collection, requestId);
      if (found) return found;
    }
    return undefined;
  };

  const showMainTab = (tab: MainTab | null, overrides?: { request?: ApiRequest; runner?: Runner }) => {
    setActiveTabKey(tab ? tabKey(tab) : null);
    setActiveSavedResponse(null);
    if (!tab) {
      setActiveRequest(null);
      setActiveRunner(null);
      setCurrentResponse(null);
      setTestResults([]);
      return;
    }
    if (tab.kind === 'runner') {
      const runner = overrides?.runner ?? runners.find(item => item.id === tab.id) ?? null;
      setActiveRequest(null);
      setActiveRunner(runner);
      setCurrentResponse(null);
      setTestResults([]);
      return;
    }
    const request = overrides?.request ?? findOpenRequest(tab.id) ?? null;
    setActiveRunner(null);
    setActiveRequest(request);
    setCurrentResponse(request ? (responseCache[request.id] ?? null) : null);
    setTestResults(request ? (testResultsByRequest[request.id] ?? []) : []);
  };

  showMainTabRef.current = showMainTab;

  const openMainTab = (tab: MainTab, overrides?: { request?: ApiRequest; runner?: Runner }) => {
    setOpenTabs(prev => openOrFocusTab(prev, tab));
    showMainTab(tab, overrides);
  };

  const handleSelectWindowTab = (key: string) => {
    const tab = openTabs.find(item => tabKey(item) === key);
    if (tab) showMainTab(tab);
  };

  const handleCloseWindowTab = (key: string) => {
    const tab = openTabs.find(item => tabKey(item) === key);
    if (!tab) return;
    const closed = closeTab(openTabs, tab);
    setOpenTabs(closed.tabs);
    if (activeTabKey !== key) return;
    if (activeSavedResponse) {
      setActiveTabKey(closed.neighbor ? tabKey(closed.neighbor) : null);
      if (!closed.neighbor) showMainTab(null);
      return;
    }
    showMainTab(closed.neighbor);
  };

  const [pendingRenameRequestId, setPendingRenameRequestId] = useState<string | null>(null);

  const handleSelectRequest = (request: ApiRequest) => {
    openMainTab({ kind: 'request', id: request.id }, { request });
  };

  const handleSelectSavedResponse = (saved: SavedResponse) => {
    setActiveSavedResponse(saved);
    setActiveRequest(saved.request);
    setActiveRunner(null);
    setCurrentResponse(saved.response);
    setTestResults([]);
  };

  // Creates a request at the root of `collection` and opens it with its name ready to edit.
  const createRequest = async (collection: Collection) => {
    const newRequest: ApiRequest = {
      id: Date.now().toString(),
      name: 'New Request',
      method: 'GET',
      url: 'https://api.example.com',
      headers: {
        'Content-Type': 'application/json'
      },
      // Set inherit as default if collection has auth configured
      auth: collection.auth ? { type: 'inherit' } : undefined
    };
    await saveCollection({ ...collection, requests: [...collection.requests, newRequest] });
    setPendingRenameRequestId(newRequest.id);
    handleSelectRequest(newRequest);
  };

  const handleSelectRunner = (runner: Runner) => {
    openMainTab({ kind: 'runner', id: runner.id }, { runner });
  };

  const handleSaveRunner = async (runner: Runner) => {
    if (!activeWorkspace) return;
    await window.electronAPI.saveRunner(activeWorkspace.id, runner);
    setRunners(prev => {
      const idx = prev.findIndex(r => r.id === runner.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = runner;
        return updated;
      }
      return [...prev, runner];
    });
    if (activeRunner?.id === runner.id) {
      setActiveRunner(runner);
    }
  };

  const handleRenameRunner = async (runnerId: string, newName: string) => {
    if (!activeWorkspace) return;
    const runner = runners.find(r => r.id === runnerId);
    if (!runner) return;
    const updated = { ...runner, name: newName, updatedAt: new Date().toISOString() };
    await window.electronAPI.saveRunner(activeWorkspace.id, updated);
    setRunners(prev => prev.map(r => r.id === runnerId ? updated : r));
    if (activeRunner?.id === runnerId) setActiveRunner(updated);
  };

  const handleDuplicateRunner = async (runner: Runner) => {
    if (!activeWorkspace) return;
    const now = new Date().toISOString();
    const copy: Runner = { ...runner, id: Date.now().toString(), name: `${runner.name} (copy)`, createdAt: now, updatedAt: now };
    await window.electronAPI.saveRunner(activeWorkspace.id, copy);
    setRunners(prev => [...prev, copy]);
    openMainTab({ kind: 'runner', id: copy.id }, { runner: copy });
  };

  const handleDeleteRunner = async (runnerId: string) => {
    if (!activeWorkspace) return;
    if (!confirm('Are you sure you want to delete this runner?')) return;
    await window.electronAPI.deleteRunner(activeWorkspace.id, runnerId);
    setRunners(prev => prev.filter(r => r.id !== runnerId));
    const closed = closeTab(openTabs, { kind: 'runner', id: runnerId });
    if (closed.tabs.length !== openTabs.length) {
      setOpenTabs(closed.tabs);
      if (activeTabKey === tabKey({ kind: 'runner', id: runnerId })) {
        showMainTab(closed.neighbor);
      }
    }
  };

  const handleAddRunner = async (collection: Collection) => {
    if (!activeWorkspace) return;
    const now = new Date().toISOString();
    const startId = `start-${Date.now()}`;
    const endId = `end-${Date.now() + 1}`;
    const newRunner: Runner = {
      id: Date.now().toString(),
      name: 'New Runner',
      collectionId: collection.id,
      workspaceId: activeWorkspace.id,
      nodes: [
        { id: startId, type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start' } },
        { id: endId, type: 'end', position: { x: 250, y: 200 }, data: { label: 'End' } },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    };
    await window.electronAPI.saveRunner(activeWorkspace.id, newRunner);
    setRunners(prev => [...prev, newRunner]);
    openMainTab({ kind: 'runner', id: newRunner.id }, { runner: newRunner });
  };

  const handleShowRunnerResponse = (response: ApiResponse, request: ApiRequest) => {
    setResponseCache(prev => ({ ...prev, [request.id]: response }));
    openMainTab({ kind: 'request', id: request.id }, { request });
    setCurrentResponse(response);
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

    if (loadingRequestIdRef.current) return;

    const showingThisRequest = () =>
      activeRequestIdRef.current === request.id &&
      !viewingSavedRef.current &&
      !activeRunnerIdRef.current;

    loadingRequestIdRef.current = request.id;
    setLoadingRequestId(request.id);
    setTestResultsByRequest(prev => ({ ...prev, [request.id]: [] }));
    if (showingThisRequest()) {
      setCurrentResponse(null);
      setTestResults([]);
    }

    try {
      const activeCollection = collections.find(c => collectionContainsRequest(c, request.id)) || null;

      // Execute pre-request script
      if (request.preRequestScript) {
        const preScriptResult = await ScriptRunner.executePreRequestScript(
          request.preRequestScript,
          activeEnvironment,
          { collection: activeCollection, certificates }
        );
        preScriptResult.logs.forEach(msg => appendConsoleLog('script', msg));

        if (!preScriptResult.success) {
          appendConsoleLog('error', `Pre-request script error: ${preScriptResult.error}`);
        }
      }

      // Make the HTTP request
      const response = await HttpService.executeRequest(request, activeEnvironment, certificates, activeCollection, resolved => {
        const headerLines = Object.entries(resolved.headers).map(([k, v]) => `  ${k}: ${v}`).join('\n');
        appendConsoleLog('info', `→ ${resolved.method} ${resolved.url}${headerLines ? `\n${headerLines}` : ''}`);
      });
      const ok = response.status >= 200 && response.status < 400;
      appendConsoleLog(
        response.status === 0 ? 'error' : ok ? 'success' : 'warn',
        `← ${response.status} ${response.statusText} (${response.time}ms)`
      );
      setResponseCache(prev => ({ ...prev, [request.id]: response }));
      if (showingThisRequest()) setCurrentResponse(response);

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
        const testScriptResult = await ScriptRunner.executeTestScript(
          request.testScript,
          response,
          activeEnvironment,
          { collection: activeCollection, certificates }
        );
        testScriptResult.logs.forEach(msg => appendConsoleLog('script', msg));

        if (!testScriptResult.success) {
          appendConsoleLog('error', `Test script error: ${testScriptResult.error}`);
        }

        const results = testScriptResult.testResults || [];
        setTestResultsByRequest(prev => ({ ...prev, [request.id]: results }));
        if (showingThisRequest()) setTestResults(results);
      } else {
        setTestResultsByRequest(prev => ({ ...prev, [request.id]: [] }));
        if (showingThisRequest()) setTestResults([]);
      }

    } catch (error: any) {
      // If we get here, it's an unexpected error (not an HTTP error)
      appendConsoleLog('error', `Fatal Error: ${error.message}`);

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
      setResponseCache(prev => ({ ...prev, [request.id]: errorResponse }));
      setTestResultsByRequest(prev => ({ ...prev, [request.id]: [] }));
      if (showingThisRequest()) {
        setCurrentResponse(errorResponse);
        setTestResults([]);
      }

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
      if (loadingRequestIdRef.current === request.id) {
        loadingRequestIdRef.current = null;
        setLoadingRequestId(null);
      }
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
      const newWindowShortcut = shortcuts.find(s => s.id === 'new-window');
      const newRequestShortcut = shortcuts.find(s => s.id === 'new-request');

      // New window shortcut
      if (newWindowShortcut && matchesShortcut(e, newWindowShortcut.currentKey)) {
        e.preventDefault();
        window.electronAPI.openNewWindow(null);
        return;
      }

      // New request shortcut: adds to the collection of the open request, else the first collection
      if (newRequestShortcut && matchesShortcut(e, newRequestShortcut.currentKey)) {
        const target = (activeRequest && collections.find(c => collectionContainsRequest(c, activeRequest.id)))
          || collections[0];
        if (target) {
          e.preventDefault();
          createRequest(target);
        }
        return;
      }

      // Open search shortcut
      if (searchShortcut && matchesShortcut(e, searchShortcut.currentKey)) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Send request shortcut (only when there's an active request and not loading)
      if (sendShortcut && matchesShortcut(e, sendShortcut.currentKey)) {
        if (activeRequest && !loadingRequestId && activeEnvironment) {
          e.preventDefault();
          executeRequest(activeRequest);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, activeRequest, loadingRequestId, activeEnvironment, executeRequest, collections, createRequest]);

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
        onOpenNewWindow={() => window.electronAPI.openNewWindow(null)}
        onOpenEnvironmentManager={() => setShowEnvManager(true)}
        onOpenCertManager={() => setShowCertManager(true)}
        onOpenImport={() => openImportModal('collection')}
        onOpenSettings={() => setShowSettings(true)}
      />

      <SearchBar
        isOpen={isSearchOpen}
        onClose={handleCloseSearch}
        onSearch={handleSearch}
        totalMatches={totalMatchCount}
        activeMatch={activeMatchIndex}
        onPrevious={handlePreviousMatch}
        onNext={handleNextMatch}
      />

      <div className="app-body">
        <ResizableSidebar defaultWidth={sidebarWidth} minWidth={250} maxWidth={600} onWidthChange={handleSidebarWidthChange}>
          <Sidebar
            activeWorkspace={activeWorkspace}
            collections={collections}
            activeRequest={activeRequest}
            savedResponses={savedResponses}
            activeSavedResponse={activeSavedResponse}
            runners={runners}
            activeRunner={activeRunner}
            onSelectRequest={handleSelectRequest}
            onSelectSavedResponse={handleSelectSavedResponse}
            onDeleteSavedResponse={handleDeleteSavedResponse}
            onRenameSavedResponse={handleRenameSavedResponse}
            onSaveCollection={saveCollection}
            onAddRequest={createRequest}
            pendingRenameRequestId={pendingRenameRequestId}
            onPendingRenameHandled={() => setPendingRenameRequestId(null)}
            onDeleteCollection={deleteCollection}
            onDeleteRequest={deleteRequest}
            onEditCollectionAuth={handleEditCollectionAuth}
            onEditCollectionVariables={handleEditCollectionVariables}
            onSelectRunner={handleSelectRunner}
            onDeleteRunner={handleDeleteRunner}
            onRenameRunner={handleRenameRunner}
            onDuplicateRunner={handleDuplicateRunner}
            onAddRunner={handleAddRunner}
            onCopyToWorkspace={setCopyToWorkspaceRequest}
          />
        </ResizableSidebar>

        <div className="main-content">
        <RequestWindowTabs
          onMove={(fromKey, toKey) => setOpenTabs(prev => moveTab(prev, fromKey, toKey))}
          tabs={openTabs.map((tab): WindowTabItem => {
            if (tab.kind === 'runner') {
              const runner = runners.find(item => item.id === tab.id);
              return { key: tabKey(tab), kind: 'runner', title: runner?.name || 'Runner' };
            }
            const request = findOpenRequest(tab.id);
            return {
              key: tabKey(tab),
              kind: 'request',
              method: request?.method,
              title: request?.name || 'Request',
              loading: loadingRequestId === tab.id,
            };
          })}
          activeKey={activeTabKey}
          suppressActive={activeSavedResponse !== null}
          onSelect={handleSelectWindowTab}
          onClose={handleCloseWindowTab}
        />
        <RequestPanel
          request={activeRequest}
          environment={activeEnvironment}
          activeCollection={(activeRequest && collections.find(c => collectionContainsRequest(c, activeRequest.id))) || null}
          onExecute={executeRequest}
          onRequestChange={handleRequestChange}
          onUpdateVariable={handleUpdateVariable}
          isLoading={!!activeRequest && loadingRequestId === activeRequest.id && !activeRunner}
          sendDisabled={loadingRequestId !== null}
          requestHistory={requestHistory}
          isReadOnly={activeSavedResponse !== null}
          searchTerm={searchTerm}
          searchOptions={searchOptions}
          activeRunner={activeRunner}
          onSaveRunner={handleSaveRunner}
          onShowRunnerResponse={handleShowRunnerResponse}
          onAddRunner={handleAddRunner}
          collections={collections}
          certificates={certificates}
        />

        {!activeRunner && (
          <ResponsePanel
            response={currentResponse}
            logs={consoleLog}
            onClearConsole={() => setConsoleLog([])}
            isLoading={!!activeRequest && loadingRequestId === activeRequest.id && !activeSavedResponse}
            activeSavedResponse={activeSavedResponse}
            onSaveResponse={handleSaveSavedResponse}
            searchTerm={searchTerm}
            searchOptions={searchOptions}
            activeMatchIndex={activeMatchIndex}
            onMatchCountChange={setTotalMatchCount}
            testResults={testResults}
          />
        )}
        </div>
      </div>

      <CertificateManager
        isOpen={showCertManager}
        onClose={() => setShowCertManager(false)}
        onCertificatesChange={setCertificates}
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
        onDuplicateEnvironment={handleDuplicateEnvironment}
        onCompareEnvironment={handleCompareEnvironment}
      />

      <EnvironmentEditor
        isOpen={showEnvEditor}
        environment={activeEnvironment}
        onClose={() => setShowEnvEditor(false)}
        onSave={saveEnvironment}
      />

      {showEnvDiff && (
        <EnvironmentDiff
          environments={environments}
          initialEnvA={envDiffSource}
          onClose={() => { setShowEnvDiff(false); setEnvDiffSource(null); }}
          onSaveEnvironment={saveEnvironment}
        />
      )}

      <WorkspaceManager
        isOpen={showWorkspaceManager}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onClose={() => setShowWorkspaceManager(false)}
        onCreateWorkspace={handleCreateWorkspace}
        onUpdateWorkspace={handleUpdateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onImportWorkspace={handleImportWorkspace}
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

      <CollectionVariablesEditor
        collection={editingCollectionVariables}
        isOpen={showCollectionVariablesModal}
        onClose={handleCloseCollectionVariablesModal}
        onSave={saveCollection}
      />
      {copyToWorkspaceRequest && (
        <CopyToWorkspaceModal
          request={copyToWorkspaceRequest}
          sourceWorkspaceId={activeWorkspace?.id}
          sourceEnvironments={environments}
          activeEnvironment={activeEnvironment}
          onClose={() => setCopyToWorkspaceRequest(null)}
        />
      )}
    </div>
  );
}

export default App;