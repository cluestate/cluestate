import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
} from 'lucide-react';
import type { Memory, MemoryStatus, Topic } from '../types';
import { api } from '../api';
import { MemoryCard } from '../components/MemoryCard';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { TopicModal } from '../components/TopicModal';
import { useToast } from '../components/Toast';

interface ReviewQueuePageProps {
  onSelectEntity: (entityId: number) => void;
  onQueueChanged?: () => void;
}

export const ReviewQueuePage: React.FC<ReviewQueuePageProps> = ({
  onSelectEntity,
  onQueueChanged,
}) => {
  const { notify, confirmAction } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [statusTab, setStatusTab] = useState<MemoryStatus | 'all'>('pending_review');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [promoteDraft, setPromoteDraft] = useState<Partial<Topic> | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [memList, topicList] = await Promise.all([
        api.listWorkspaceMemories({
          status: statusTab === 'all' ? undefined : statusTab,
          topicId: topicFilter === 'all' ? undefined : Number(topicFilter),
          search: search.trim() || undefined,
          limit: 150,
        }),
        api.listTopics(false),
      ]);
      setMemories(memList);
      setTopics(topicList);
      if (memList.length > 0) {
        setSelectedMemory((prev) =>
          prev ? memList.find((m) => m.id === prev.id) || memList[0] : memList[0]
        );
      } else {
        setSelectedMemory(null);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to load memories queue', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [statusTab, topicFilter, search, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleUpdateMemory = async (
    memoryId: number,
    data: {
      status?: MemoryStatus;
      claim?: string;
      value?: string;
      topic_id?: number | null;
    }
  ) => {
    try {
      const updated = await api.updateMemory(memoryId, data);
      notify(
        data.status
          ? `Memory #${memoryId} marked as ${data.status}`
          : `Memory #${memoryId} updated`,
        'success'
      );
      setMemories((prev) =>
        statusTab !== 'all' && data.status && data.status !== statusTab
          ? prev.filter((m) => m.id !== memoryId)
          : prev.map((m) => (m.id === memoryId ? updated : m))
      );
      setSelectedMemory((prev) => (prev?.id === memoryId ? updated : prev));
      if (onQueueChanged) onQueueChanged();
    } catch (err: any) {
      notify(err.message || 'Failed to update memory', 'error');
    }
  };

  const handleDeleteMemory = (memoryId: number) => {
    confirmAction({
      title: `Delete Memory #${memoryId}?`,
      description:
        'This permanently deletes the claim, its evidence links, and any source episodes backed solely by this claim.',
      confirmLabel: 'Delete Permanently',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteMemory(memoryId);
          notify(`Memory #${memoryId} deleted`, 'info');
          setMemories((prev) => prev.filter((m) => m.id !== memoryId));
          if (selectedMemory?.id === memoryId) setSelectedMemory(null);
          if (onQueueChanged) onQueueChanged();
        } catch (err: any) {
          notify(err.message || 'Failed to delete memory', 'error');
        }
      },
    });
  };

  const handlePromoteToTag = (mem: Memory) => {
    const suggestedSlug = (mem.value || mem.claim)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 28)
      .replace(/^_|_$/g, '');
    setPromoteDraft({
      name: suggestedSlug || 'custom_attribute',
      label: '',
      description: `Promoted from discovery: "${mem.claim}"`,
      data_type: 'text',
      cardinality: 'single',
      update_policy: 'replace',
    });
  };

  const handleCreatePromotedTopic = async (topicData: any) => {
    const created = await api.createTopic(topicData);
    notify(`Created Memory Tag #${created.name}`, 'success');
    if (selectedMemory) {
      await handleUpdateMemory(selectedMemory.id, { topic_id: created.id });
    }
    setPromoteDraft(null);
    loadData();
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">HUMAN-IN-THE-LOOP VERIFICATION</div>
          <h1 className="page-title">Review Queue</h1>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={loadData}>
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Borderless Filter Sub-Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div className="segmented-control">
          {(
            [
              { id: 'pending_review', label: 'NEEDS REVIEW' },
              { id: 'active', label: 'ACTIVE' },
              { id: 'confirmed', label: 'CONFIRMED' },
              { id: 'superseded', label: 'SUPERSEDED' },
              { id: 'rejected', label: 'REJECTED' },
              { id: 'all', label: 'ALL CLAIMS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`segmented-option ${statusTab === tab.id ? 'active' : ''}`}
              onClick={() => setStatusTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: '190px', padding: '6px 28px 6px 10px', fontSize: '12px' }}
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
          >
            <option value="all">All Schema Tags</option>
            <option value="0">Untagged Discoveries</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name}
              </option>
            ))}
          </select>

          <div className="search-bar" style={{ width: '220px' }}>
            <Search className="search-bar-icon" size={14} />
            <input
              type="text"
              className="input"
              style={{ fontSize: '12.5px' }}
              placeholder="Filter claims or values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2:1 Open Split: Signal Strips on Left + Cool Ice Provenance Plane on Right */}
      <div className="split-ledger">
        <div>
          {memories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {memories.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  memory={mem}
                  isSelected={selectedMemory?.id === mem.id}
                  onSelect={setSelectedMemory}
                  showEntityName
                  entityName={mem.entity_name || undefined}
                  onSelectEntity={onSelectEntity}
                  onUpdateStatus={(id, status) => handleUpdateMemory(id, { status })}
                  onDelete={handleDeleteMemory}
                />
              ))}
            </div>
          ) : (
            !isLoading && (
              <div className="surface-ice empty-state">
                <h4 className="empty-state-title">
                  {statusTab === 'pending_review'
                    ? 'Review Queue is Clear'
                    : 'No Claims Match Filter'}
                </h4>
                <p className="empty-state-text">
                  {statusTab === 'pending_review'
                    ? 'All clinical safety rules, conflicts, and schema-quarantined claims have been reviewed.'
                    : 'Switch status tabs or clear your search filter to inspect other workspace claims.'}
                </p>
              </div>
            )
          )}
        </div>

        <EvidenceInspector
          memory={selectedMemory}
          topics={topics}
          onUpdateMemory={handleUpdateMemory}
          onDeleteMemory={handleDeleteMemory}
          onPromoteToTag={handlePromoteToTag}
          onSelectEntity={onSelectEntity}
        />
      </div>

      <TopicModal
        isOpen={Boolean(promoteDraft)}
        onClose={() => setPromoteDraft(null)}
        onSubmit={handleCreatePromotedTopic}
        presetDraft={promoteDraft}
      />
    </div>
  );
};
