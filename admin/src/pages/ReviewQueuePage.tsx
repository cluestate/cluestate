import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  ClipboardCheck,
  Tag,
} from 'lucide-react';
import type { Memory, MemoryStatus, Topic } from '../types';
import { api } from '../api';
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

  // Promote untagged discovery to defined schema tag modal
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
      notify(err.message || 'Failed to load memories ledger', 'error');
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

  const getStatusBadge = (st: MemoryStatus) => {
    switch (st) {
      case 'confirmed':
        return <span className="badge badge-success">CONFIRMED</span>;
      case 'active':
        return <span className="badge badge-info">ACTIVE</span>;
      case 'pending_review':
        return <span className="badge badge-warning">NEEDS REVIEW</span>;
      case 'rejected':
        return <span className="badge badge-danger">REJECTED</span>;
      case 'superseded':
        return <span className="badge badge-neutral">SUPERSEDED</span>;
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">HUMAN-IN-THE-LOOP VERIFICATION</div>
          <h1 className="page-title">Review Queue &amp; Global Memory Ledger</h1>
          <p className="page-subtitle">
            Audit quarantined claims, sensitive clinical/financial updates, and unverified excerpts against original source transcripts.
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          <RefreshCw size={13} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div className="segmented-control">
          {(
            [
              { id: 'pending_review', label: 'Needs Review' },
              { id: 'active', label: 'Active' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'superseded', label: 'Superseded' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'all', label: 'All Claims' },
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: '200px', padding: '6px 28px 6px 10px', fontSize: '12.5px' }}
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
          >
            <option value="all">All Schema Tags</option>
            <option value="0">Untagged / Open Discoveries</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name}
              </option>
            ))}
          </select>

          <div className="search-bar" style={{ width: '240px' }}>
            <Search className="search-bar-icon" size={14} />
            <input
              type="text"
              className="input"
              style={{ padding: '6px 10px 6px 32px', fontSize: '12.5px' }}
              placeholder="Filter claims or values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2:1 Master-Detail Split */}
      <div className="split-ledger">
        {/* Left 2/3: Claims Queue Table */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Profile</th>
                <th>Tag &amp; Value</th>
                <th>Atomic Claim</th>
                <th>Provenance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((mem) => {
                const isSelected = selectedMemory?.id === mem.id;
                const ev = mem.evidence && mem.evidence[0];
                return (
                  <tr
                    key={mem.id}
                    className={`clickable ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedMemory(mem)}
                  >
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {mem.entity_name || `Entity #${mem.entity_id}`}
                      </div>
                      {mem.entity_external_id && (
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {mem.entity_external_id}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        {mem.topic_name ? (
                          <span className="tag-pill">
                            <Tag size={10} />
                            {mem.topic_name}
                          </span>
                        ) : (
                          <span className="badge badge-neutral">open_discovery</span>
                        )}
                        {mem.value && <span className="value-pill">= {mem.value}</span>}
                      </div>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                        {mem.claim}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {ev ? (
                        ev.is_verified ? (
                          <span className="badge badge-success">
                            <ShieldCheck size={11} />
                            [{ev.char_start}:{ev.char_end}]
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            <AlertTriangle size={11} />
                            Unverified
                          </span>
                        )
                      ) : (
                        <span className="badge badge-neutral">No quote</span>
                      )}
                    </td>
                    <td>{getStatusBadge(mem.status)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        {mem.status !== 'confirmed' && (
                          <button
                            type="button"
                            className="btn btn-success btn-xs"
                            title="Approve & Confirm"
                            onClick={() => handleUpdateMemory(mem.id, { status: 'confirmed' })}
                          >
                            <CheckCircle2 size={12} />
                            <span>Approve</span>
                          </button>
                        )}
                        {mem.status !== 'rejected' && (
                          <button
                            type="button"
                            className="btn btn-danger btn-xs"
                            title="Reject claim"
                            onClick={() => handleUpdateMemory(mem.id, { status: 'rejected' })}
                          >
                            <XCircle size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {memories.length === 0 && !isLoading && (
            <div className="empty-state">
              <ClipboardCheck className="empty-state-icon" />
              <h4 className="empty-state-title">
                {statusTab === 'pending_review'
                  ? 'Review Queue is Clear'
                  : 'No Claims Matching Filter'}
              </h4>
              <p className="empty-state-text">
                {statusTab === 'pending_review'
                  ? 'All sensitive, conflicting, or schema-quarantined claims have been reviewed.'
                  : 'Switch status tabs or clear your search filter to inspect other workspace claims.'}
              </p>
            </div>
          )}
        </div>

        {/* Right 1/3: Live Evidence Inspector */}
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
