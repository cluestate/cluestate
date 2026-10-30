import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { EntityModal } from './components/EntityModal';
import { IngestModal } from './components/IngestModal';
import { DashboardPage } from './pages/DashboardPage';
import { EntitiesPage } from './pages/EntitiesPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { TopicsPage } from './pages/TopicsPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { SettingsPage } from './pages/SettingsPage';
import type { HealthInfo } from './types';
import { api } from './api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  // Modals
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  const fetchHealth = async () => {
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
  };

  useEffect(() => {
    fetchHealth();
  }, []);

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

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        health={health}
        onOpenIngest={() => setIsIngestModalOpen(true)}
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
          <SettingsPage health={health} onRefreshHealth={fetchHealth} />
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
          // If in detail view, will be refreshed
        }}
      />
    </div>
  );
};

export default App;
