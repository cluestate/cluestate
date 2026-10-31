import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EntityModal } from './components/EntityModal';
import { IngestModal } from './components/IngestModal';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { EntitiesPage } from './pages/EntitiesPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { TopicsPage } from './pages/TopicsPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { SettingsPage } from './pages/SettingsPage';
import type { HealthInfo, User, Workspace } from './types';
import { api, TOKEN_STORAGE_KEY, API_KEY_STORAGE_KEY } from './api';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [initialApiKey, setInitialApiKey] = useState<string | null>(null);

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  // Modals
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch {
      setHealth({
        status: 'error',
        version: '0.1.0',
        llm_model: 'offline',
        database: 'offline',
      });
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    setIsAuthenticated(false);
    setUser(null);
    setWorkspace(null);
    setInitialApiKey(null);
  }, []);

  useEffect(() => {
    fetchHealth();

    const checkSession = async () => {
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
          setIsAuthenticated(true);
        } else if (apiKey) {
          await api.getStats();
          setWorkspace({
            id: 1,
            name: 'API Key Session',
            slug: 'api-key',
            created_at: new Date().toISOString(),
          });
          setIsAuthenticated(true);
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
  }, [fetchHealth, handleLogout]);

  const handleAuthenticated = (
    authUser: User | null,
    authWorkspace: Workspace | null,
    newApiKey?: string | null
  ) => {
    setUser(authUser);
    setWorkspace(authWorkspace);
    if (newApiKey) {
      setInitialApiKey(newApiKey);
      setCurrentTab('settings');
    } else {
      setCurrentTab('dashboard');
    }
    setIsAuthenticated(true);
  };

  const handleSelectEntity = (entityId: number) => {
    setSelectedEntityId(entityId);
    setCurrentTab('entity_detail');
  };

  const handleSelectTab = (tab: string) => {
    setSelectedEntityId(null);
    setCurrentTab(tab);
  };

  const handleCreateEntity = async (entityData: any) => {
    const created = await api.createEntity(entityData);
    setIsEntityModalOpen(false);
    handleSelectEntity(created.id);
  };

  if (isCheckingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}
      >
        Loading ClueState...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        health={health}
        user={user}
        workspace={workspace}
        onOpenIngest={() => setIsIngestModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {currentTab === 'dashboard' && (
          <DashboardPage
            onSelectEntity={handleSelectEntity}
            onOpenNewEntity={() => setIsEntityModalOpen(true)}
            onOpenIngest={() => setIsIngestModalOpen(true)}
            onNavigateTab={handleSelectTab}
            health={health}
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

        {currentTab === 'topics' && <TopicsPage />}

        {currentTab === 'playground' && (
          <PlaygroundPage onSelectEntity={handleSelectEntity} />
        )}

        {currentTab === 'settings' && (
          <SettingsPage
            health={health}
            onRefreshHealth={fetchHealth}
            initialNewKey={initialApiKey}
          />
        )}
      </main>

      {/* Modals */}
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
          // Refreshed by active page
        }}
      />
    </div>
  );
};

export default App;
