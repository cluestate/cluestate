import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EntityModal } from './components/EntityModal';
import { IngestModal } from './components/IngestModal';
import { WorkspaceModal } from './components/WorkspaceModal';
import { ToastProvider, useToast } from './components/Toast';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { EntitiesPage } from './pages/EntitiesPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { TopicsPage } from './pages/TopicsPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { SettingsPage } from './pages/SettingsPage';
import type { DashboardStats, HealthInfo, SystemInfo, User, Workspace } from './types';
import {
  api,
  TOKEN_STORAGE_KEY,
  API_KEY_STORAGE_KEY,
  WORKSPACE_ID_STORAGE_KEY,
} from './api';

function extractInviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const qInvite = params.get('invite');
  if (qInvite) return qInvite;
  const pathMatch = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)/);
  return pathMatch ? pathMatch[1] : null;
}

const AppInner: React.FC = () => {
  const { notify } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [initialApiKey, setInitialApiKey] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(extractInviteTokenFromUrl);

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);

  // Modals
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch {
      setHealth({
        status: 'error',
        version: '0.1.1',
      });
    }
  }, []);

  const refreshWorkspaceMeta = useCallback(async () => {
    try {
      const stats = await api.getStats();
      if (stats.system_info) setSystemInfo(stats.system_info);
      setPendingReviewCount(
        stats.pending_review_memories ?? stats.status_counts?.pending_review ?? 0
      );
    } catch {
      // Ignore
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_ID_STORAGE_KEY);
    setIsAuthenticated(false);
    setUser(null);
    setWorkspace(null);
    setWorkspaces([]);
    setInitialApiKey(null);
  }, []);

  useEffect(() => {
    fetchHealth();

    const checkSession = async () => {
      if (inviteToken) {
        setIsCheckingAuth(false);
        return;
      }

      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);

      if (!token && !apiKey) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        if (token) {
          const me = await api.getMe();
          setUser(me.user);
          setWorkspace(me.workspace);
          setWorkspaces(me.workspaces || [me.workspace]);
          localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(me.workspace.id));
          setIsAuthenticated(true);
          await refreshWorkspaceMeta();
        } else if (apiKey) {
          const ws = await api.getCurrentWorkspace();
          setWorkspace(ws);
          setWorkspaces([ws]);
          setIsAuthenticated(true);
          await refreshWorkspaceMeta();
        }
      } catch {
        handleLogout();
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkSession();

    const onUnauthorized = () => handleLogout();
    window.addEventListener('cluestate:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cluestate:unauthorized', onUnauthorized);
  }, [fetchHealth, handleLogout, inviteToken, refreshWorkspaceMeta]);

  const handleAuthenticated = (
    authUser: User | null,
    authWorkspace: Workspace | null,
    allWorkspaces?: Workspace[],
    newApiKey?: string | null
  ) => {
    setUser(authUser);
    setWorkspace(authWorkspace);
    setWorkspaces(allWorkspaces || (authWorkspace ? [authWorkspace] : []));
    setInviteToken(null);
    if (typeof window !== 'undefined' && window.location.search.includes('invite=')) {
      window.history.replaceState({}, '', '/');
    }
    if (newApiKey) {
      setInitialApiKey(newApiKey);
      setCurrentTab('settings');
    } else {
      setCurrentTab('dashboard');
    }
    setIsAuthenticated(true);
    refreshWorkspaceMeta();
  };

  const handleSwitchWorkspace = async (targetWs: Workspace) => {
    localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(targetWs.id));
    setWorkspace(targetWs);
    setSelectedEntityId(null);
    setInitialApiKey(null);
    notify(`Switched to workspace: ${targetWs.name}`, 'info');
    await refreshWorkspaceMeta();
  };

  const handleCreateWorkspace = async (data: {
    name: string;
    clone_schema_from_workspace_id?: number | null;
  }) => {
    const res = await api.createWorkspace(data);
    const createdWs = res.workspace;
    localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(createdWs.id));
    setWorkspace(createdWs);
    setWorkspaces((prev) => [...prev, createdWs]);
    setInitialApiKey(res.initial_api_key);
    setSelectedEntityId(null);
    setCurrentTab('settings');
    notify(`Created workspace "${createdWs.name}"`, 'success');
    await refreshWorkspaceMeta();
  };

  const handleSelectEntity = (entityId: number) => {
    setSelectedEntityId(entityId);
    setCurrentTab('entity_detail');
  };

  const handleSelectTab = (tab: string) => {
    setSelectedEntityId(null);
    setCurrentTab(tab);
    refreshWorkspaceMeta();
  };

  const handleCreateEntity = async (entityData: any) => {
    const created = await api.createEntity(entityData);
    setIsEntityModalOpen(false);
    notify(`Created profile "${created.name || created.external_id}"`, 'success');
    handleSelectEntity(created.id);
  };

  const handleStatsLoaded = (stats: DashboardStats) => {
    if (stats.system_info) setSystemInfo(stats.system_info);
    setPendingReviewCount(
      stats.pending_review_memories ?? stats.status_counts?.pending_review ?? 0
    );
  };

  const handleWorkspaceUpdated = (updatedWs: Workspace) => {
    setWorkspace(updatedWs);
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === updatedWs.id ? { ...w, ...updatedWs } : w))
    );
  };

  if (isCheckingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-canvas)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
        }}
      >
        Initializing ClueState Ledger…
      </div>
    );
  }

  if (!isAuthenticated || inviteToken) {
    return (
      <AuthPage
        inviteToken={inviteToken}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        health={health}
        systemInfo={systemInfo}
        pendingReviewCount={pendingReviewCount}
        user={user}
        workspace={workspace}
        workspaces={workspaces}
        onSwitchWorkspace={handleSwitchWorkspace}
        onOpenNewWorkspace={() => setIsWorkspaceModalOpen(true)}
        onOpenIngest={() => setIsIngestModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="main-content" key={workspace?.id || 'default'}>
        {currentTab === 'dashboard' && (
          <DashboardPage
            workspace={workspace}
            onSelectEntity={handleSelectEntity}
            onOpenNewEntity={() => setIsEntityModalOpen(true)}
            onOpenIngest={() => setIsIngestModalOpen(true)}
            onNavigateTab={handleSelectTab}
            health={health}
            onStatsLoaded={handleStatsLoaded}
          />
        )}

        {currentTab === 'review' && (
          <ReviewQueuePage
            onSelectEntity={handleSelectEntity}
            onQueueChanged={refreshWorkspaceMeta}
          />
        )}

        {currentTab === 'entities' && (
          <EntitiesPage
            onSelectEntity={handleSelectEntity}
            onOpenNewEntity={() => setIsEntityModalOpen(true)}
          />
        )}

        {currentTab === 'entity_detail' && selectedEntityId && (
          <EntityDetailPage
            entityId={selectedEntityId}
            onBack={() => setCurrentTab('entities')}
          />
        )}

        {currentTab === 'topics' && (
          <TopicsPage
            workspace={workspace}
            onWorkspaceUpdated={handleWorkspaceUpdated}
          />
        )}

        {currentTab === 'playground' && (
          <PlaygroundPage onSelectEntity={handleSelectEntity} />
        )}

        {currentTab === 'settings' && (
          <SettingsPage
            health={health}
            systemInfo={systemInfo}
            user={user}
            workspace={workspace}
            onRefreshHealth={fetchHealth}
            onWorkspaceUpdated={handleWorkspaceUpdated}
            onOpenNewWorkspace={() => setIsWorkspaceModalOpen(true)}
            initialNewKey={initialApiKey}
          />
        )}
      </main>

      <EntityModal
        isOpen={isEntityModalOpen}
        onClose={() => setIsEntityModalOpen(false)}
        onSubmit={handleCreateEntity}
      />

      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        presetEntityId={selectedEntityId || undefined}
        onIngestComplete={() => {
          refreshWorkspaceMeta();
        }}
      />

      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        workspaces={workspaces}
        onSubmit={handleCreateWorkspace}
      />
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);

export default App;
