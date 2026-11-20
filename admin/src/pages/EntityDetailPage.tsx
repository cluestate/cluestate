import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Send,
  Trash2,
} from 'lucide-react';
import type { Entity, Episode, IntelResponse, Memory, MemoryStatus, Topic } from '../types';
import { api } from '../api';
import { MemoryCard } from '../components/MemoryCard';
import { EvidenceInspector } from '../components/EvidenceInspector';
import { TopicModal } from '../components/TopicModal';
import { useToast } from '../components/Toast';

interface EntityDetailPageProps {
  entityId: number;
  onBack: () => void;
}

export const EntityDetailPage: React.FC<EntityDetailPageProps> = ({
  entityId,
  onBack,
}) => {
  const { notify, confirmAction } = useToast();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [intel, setIntel] = useState<IntelResponse | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);

  const [activeTab, setActiveTab] = useState<'memories' | 'timeline' | 'intel' | 'ingest'>('memories');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [intelViewMode, setIntelViewMode] = useState<'prompt' | 'json'>('prompt');

  // Promote untagged discovery
  const [promoteDraft, setPromoteDraft] = useState<Partial<Topic> | null>(null);

  // Ingest form state
  const [ingestText, setIngestText] = useState('');
  const [sourceType, setSourceType] = useState<string>('conversation');
  const [availableSourceTypes, setAvailableSourceTypes] = useState<string[]>([
    'conversation',
    'note',
    'interaction',
    'custom',
  ]);
  const [isCustomSourceType, setIsCustomSourceType] = useState(false);
  const [customSourceTypeInput, setCustomSourceTypeInput] = useState('');
  const [sourceDesc, setSourceDesc] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [copiedIntel, setCopiedIntel] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const loadEntityData = async () => {
    try {
      setIsLoading(true);
      api
        .getSourceTypes()
        .then((r) => {
          if (r && r.source_types && r.source_types.length > 0) {
            setAvailableSourceTypes(r.source_types);
          }
        })
        .catch(() => {});

      const [entData, memData, epData, intelData, topicData] = await Promise.all([
        api.getEntity(entityId),
        api.getEntityMemories(entityId, undefined, undefined, true),
        api.getEntityEpisodes(entityId),
        api.getEntityIntel(entityId),
        api.listTopics(false),
      ]);
      setEntity(entData);
      setMemories(memData);
      setEpisodes(epData);
      setIntel(intelData);
      setTopics(topicData);
      if (memData.length > 0) {
        setSelectedMemory((prev) =>
          prev ? memData.find((m) => m.id === prev.id) || memData[0] : memData[0]
        );
      } else {
        setSelectedMemory(null);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to load profile ledger', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEntityData();
  }, [entityId]);

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
      notify(`Memory #${memoryId} updated`, 'success');
      const [updatedMemories, updatedIntel] = await Promise.all([
        api.getEntityMemories(entityId, undefined, undefined, true),
        api.getEntityIntel(entityId),
      ]);
      setMemories(updatedMemories);
      setIntel(updatedIntel);
      setSelectedMemory(updated);
    } catch (err: any) {
      notify(err.message || 'Failed to update memory', 'error');
    }
  };

  const handleDeleteMemory = (memoryId: number) => {
    confirmAction({
      title: `Delete Memory #${memoryId}?`,
      description:
        'Permanently deletes this memory claim, its evidence, and any source episodes backed solely by it.',
      confirmLabel: 'Delete Claim',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteMemory(memoryId);
          notify(`Deleted memory #${memoryId}`, 'info');
          await loadEntityData();
        } catch (err: any) {
          notify(err.message || 'Failed to delete memory', 'error');
        }
      },
    });
  };

  const handleDeleteEpisode = (epId: number) => {
    confirmAction({
      title: `Delete Source Episode #${epId}?`,
      description:
        'Removes this source transcript and any memories that were backed exclusively by this episode.',
      confirmLabel: 'Delete Episode',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteEpisode(epId);
          notify(`Deleted episode #${epId}`, 'info');
          await loadEntityData();
        } catch (err: any) {
          notify(err.message || 'Failed to delete episode', 'error');
        }
      },
    });
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;

    try {
      setIsIngesting(true);
      const finalSourceType = isCustomSourceType
        ? customSourceTypeInput.trim() || 'custom'
        : sourceType;

      const res = await api.ingest({
        entity_id: entityId,
        content: ingestText.trim(),
        source_type: finalSourceType,
        source_description: sourceDesc.trim() || undefined,
      });
      notify(`Extracted ${res.memories_extracted} claim(s) from source record`, 'success');
      setIngestText('');
      setSourceDesc('');
      await loadEntityData();
      setActiveTab('memories');
    } catch (err: any) {
      notify(err.message || 'Ingestion failed', 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleCopyIntel = () => {
    const payload =
      intelViewMode === 'json'
        ? JSON.stringify(intel?.state || {}, null, 2)
        : intel?.formatted_prompt || '';
    if (!payload) return;
    navigator.clipboard.writeText(payload);
    setCopiedIntel(true);
    notify('Copied to clipboard', 'info');
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const handleCopyId = () => {
    if (!entity?.external_id) return;
    navigator.clipboard.writeText(entity.external_id);
    setCopiedId(true);
    notify(`Copied external ID: ${entity.external_id}`, 'info');
    setTimeout(() => setCopiedId(false), 1500);
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
    loadEntityData();
  };

  const uniqueTopics = Array.from(
    new Set(memories.map((m) => m.topic_name).filter(Boolean) as string[])
  );

  const activeFactCount = memories.filter(
    (m) => m.status === 'active' || m.status === 'confirmed'
  ).length;
  const pendingReviewCount = memories.filter((m) => m.status === 'pending_review').length;

  const filteredMemories = memories.filter((m) => {
    if (selectedTopic !== 'all' && m.topic_name !== selectedTopic) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });

  const compiledState = intel?.state || entity?.state || {};
  const stateEntries = Object.entries(compiledState);

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  if (isLoading && !entity) {
    return (
      <div className="page-container loading-overlay">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="page-container">
      {/* Back navigation */}
      <button
        type="button"
        className="btn btn-ghost btn-xs mb-4"
        onClick={onBack}
        style={{ color: 'var(--text-secondary)', paddingLeft: 0 }}
      >
        <ArrowLeft size={13} />
        <span>All Profiles</span>
      </button>

      {/* Deep Obsidian Profile Focal Anchor (Landing-Page Hero Signature!) */}
      <div className="profile-anchor">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="profile-anchor-avatar">
            {entity.name ? entity.name[0].toUpperCase() : 'P'}
          </div>

          <div>
            <div
              className="mono"
              style={{
                fontSize: '10.5px',
                color: 'rgba(255,255,255,0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '2px',
              }}
            >
              <span>CLUESTATE LIVE PROFILE</span>
              <span>·</span>
              <span>{entity.external_id}</span>
              <button
                type="button"
                onClick={handleCopyId}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                }}
                title="Copy External ID"
              >
                {copiedId ? <Check size={11} color="#34D399" /> : <Copy size={11} />}
              </button>
              <span>·</span>
              <span>{entity.entity_type.toUpperCase()}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  letterSpacing: '-0.025em',
                }}
              >
                {entity.name || 'Unnamed Profile'}
              </h1>

              <span
                className="mono"
                style={{
                  fontSize: '11px',
                  color: '#4EE2C8',
                  fontWeight: 600,
                }}
              >
                ■ {activeFactCount} ACTIVE
              </span>

              {pendingReviewCount > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: '11px',
                    color: '#FF7A78',
                    fontWeight: 600,
                  }}
                >
                  ■ {pendingReviewCount} REVIEW
                </span>
              )}
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('ingest')}>
          <span>+ Ingest Record -&gt;</span>
        </button>
      </div>

      {/* Deterministic Compiled State Signal Grid */}
      {stateEntries.length > 0 && (
        <div className="state-sheet">
          <div className="state-sheet-header">
            <span className="card-title" style={{ margin: 0 }}>
              COMPILED DETERMINISTIC STATE ({stateEntries.length})
            </span>
            <span className="mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              CLICK ANY SIGNAL TO INSPECT SOURCE QUOTE
            </span>
          </div>
          <div className="state-sheet-grid">
            {stateEntries.map(([key, val]) => {
              const matchingMem = memories.find(
                (m) =>
                  m.topic_name === key &&
                  (m.status === 'active' || m.status === 'confirmed')
              );
              const topicMeta = topics.find((t) => t.name === key);
              const isSafety = /(allergy|allergies|medical|restriction|condition|compliance)/.test(
                key.toLowerCase()
              );
              return (
                <div
                  key={key}
                  className="state-field"
                  style={{
                    cursor: matchingMem ? 'pointer' : 'default',
                    borderLeftColor: isSafety ? 'var(--signal-red)' : 'var(--teal)',
                  }}
                  onClick={() => {
                    if (matchingMem) {
                      setSelectedMemory(matchingMem);
                      setActiveTab('memories');
                    }
                  }}
                >
                  <div className="state-field-key">
                    <span>{topicMeta?.label || key.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="state-field-val">
                    {typeof val === 'boolean' ? (
                      <span style={{ color: val ? 'var(--teal)' : 'var(--text-secondary)' }}>
                        {val ? 'True (Yes)' : 'False (No)'}
                      </span>
                    ) : Array.isArray(val) ? (
                      <span>{val.map(String).join(' · ')}</span>
                    ) : (
                      <span>
                        {String(val)}
                        {topicMeta?.constraints?.unit ? ` ${topicMeta.constraints.unit}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'memories' ? 'active' : ''}`}
          onClick={() => setActiveTab('memories')}
        >
          <span>Signal Strips ({memories.length})</span>
        </button>

        <button
          type="button"
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <span>Source Episodes ({episodes.length})</span>
        </button>

        <button
          type="button"
          className={`tab ${activeTab === 'intel' ? 'active' : ''}`}
          onClick={() => setActiveTab('intel')}
        >
          <span>Prompt &amp; JSON Output</span>
        </button>

        <button
          type="button"
          className={`tab ${activeTab === 'ingest' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingest')}
        >
          <span>+ Ingest Record</span>
        </button>
      </div>

      {/* TAB 1: SIGNAL STRIPS + 2:1 COOL ICE PROVENANCE INSPECTOR */}
      {activeTab === 'memories' && (
        <div>
          {/* Borderless Filters */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '18px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-option ${selectedTopic === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedTopic('all')}
              >
                ALL TAGS
              </button>
              {uniqueTopics.map((top) => (
                <button
                  key={top}
                  type="button"
                  className={`segmented-option ${selectedTopic === top ? 'active' : ''}`}
                  onClick={() => setSelectedTopic(top)}
                >
                  {top.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="segmented-control">
              {(['all', 'confirmed', 'active', 'pending_review', 'superseded', 'rejected'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    className={`segmented-option ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                    style={{ textTransform: 'uppercase' }}
                  >
                    {st === 'pending_review' ? 'Needs Review' : st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="split-ledger">
            <div>
              {filteredMemories.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredMemories.map((mem) => (
                    <MemoryCard
                      key={mem.id}
                      memory={mem}
                      isSelected={selectedMemory?.id === mem.id}
                      onSelect={setSelectedMemory}
                      onUpdateStatus={(id, status) => handleUpdateMemory(id, { status })}
                      onDelete={handleDeleteMemory}
                    />
                  ))}
                </div>
              ) : (
                <div className="surface-ice empty-state">
                  <h4 className="empty-state-title">No Signal Strips Match Filter</h4>
                  <p className="empty-state-text">
                    {memories.length === 0
                      ? 'No state records have been extracted for this profile yet.'
                      : 'Reset the active tag or status filter to view all claims.'}
                  </p>
                  {memories.length === 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('ingest')}>
                      <span>+ Ingest First Record -&gt;</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <EvidenceInspector
              memory={selectedMemory}
              topics={topics}
              onUpdateMemory={handleUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
              onPromoteToTag={handlePromoteToTag}
            />
          </div>
        </div>
      )}

      {/* TAB 2: EPISODE TIMELINE */}
      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {episodes.map((ep) => (
            <div key={ep.id} className="signal-strip">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge badge-info">{ep.source_type}</span>
                  {ep.source_description && (
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {ep.source_description}
                    </span>
                  )}
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    EPISODE #{ep.id}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {formatDate(ep.occurred_at || ep.created_at)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--signal-red)' }}
                    onClick={() => handleDeleteEpisode(ep.id)}
                    title="Delete episode and orphaned claims"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="episode-reader" style={{ background: 'var(--bg-ice)', borderLeft: 'none' }}>
                {ep.content}
              </div>
            </div>
          ))}

          {episodes.length === 0 && (
            <div className="surface-ice empty-state">
              <h4 className="empty-state-title">No Source Episodes Recorded</h4>
              <p className="empty-state-text">
                Episodes store the immutable raw transcript, clinical note, or message with SHA-256 verification.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROMPT & COMPILED JSON STATE */}
      {activeTab === 'intel' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 className="card-title" style={{ marginBottom: '2px' }}>
                COMPILED ENTITY INTELLIGENCE OUTPUT
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Use <code>intel.state</code> for deterministic backend logic or <code>intel.formatted_prompt</code> for LLM system context.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-option ${intelViewMode === 'prompt' ? 'active' : ''}`}
                  onClick={() => setIntelViewMode('prompt')}
                >
                  SYSTEM PROMPT
                </button>
                <button
                  type="button"
                  className={`segmented-option ${intelViewMode === 'json' ? 'active' : ''}`}
                  onClick={() => setIntelViewMode('json')}
                >
                  JSON STATE
                </button>
              </div>

              <button className="btn btn-primary btn-sm" onClick={handleCopyIntel}>
                {copiedIntel ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedIntel ? 'Copied' : 'Copy Output'}</span>
              </button>
            </div>
          </div>

          <pre className="intel-preview">
            {intelViewMode === 'json'
              ? JSON.stringify(intel?.state || {}, null, 2)
              : intel?.formatted_prompt || 'No formatted state available.'}
          </pre>
        </div>
      )}

      {/* TAB 4: DIRECT INGESTION */}
      {activeTab === 'ingest' && (
        <div style={{ maxWidth: '680px' }}>
          <h3 className="card-title">INGEST SOURCE RECORD FOR {entity.name.toUpperCase()}</h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Paste any consultation note, dialogue transcript, or intake record. The engine will extract atomic claims, verify character spans, and resolve state transitions.
          </p>

          <form onSubmit={handleIngest}>
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Provenance Source Type</label>
                <select
                  className="input"
                  value={isCustomSourceType ? '__custom__' : sourceType}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomSourceType(true);
                    } else {
                      setIsCustomSourceType(false);
                      setSourceType(e.target.value);
                    }
                  }}
                >
                  {availableSourceTypes.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                  <option value="__custom__">+ Define New Source Category…</option>
                </select>
                {isCustomSourceType && (
                  <input
                    type="text"
                    className="input mono"
                    style={{ marginTop: '6px' }}
                    placeholder="e.g. clinical_intake, lab_note"
                    value={customSourceTypeInput}
                    onChange={(e) => setCustomSourceTypeInput(e.target.value)}
                    autoFocus
                  />
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Reference Note (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Initial intake consultation"
                  value={sourceDesc}
                  onChange={(e) => setSourceDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Source Content / Transcript *</label>
              <textarea
                className="input"
                style={{ minHeight: '160px', fontSize: '13.5px' }}
                placeholder={`Example:\nPatient states she has been strictly vegan for the past 4 years and has a documented penicillin allergy. Prefers appointment reminders via SMS.`}
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isIngesting || !ingestText.trim()}
              >
                {isIngesting ? (
                  <>
                    <div className="spinner" style={{ borderTopColor: '#fff' }} />
                    <span>Extracting &amp; Verifying…</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Extract &amp; Update State -&gt;</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <TopicModal
        isOpen={Boolean(promoteDraft)}
        onClose={() => setPromoteDraft(null)}
        onSubmit={handleCreatePromotedTopic}
        presetDraft={promoteDraft}
      />
    </div>
  );
};
