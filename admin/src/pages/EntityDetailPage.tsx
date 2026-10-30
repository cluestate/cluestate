import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Brain,
  FileText,
  Sparkles,
  Copy,
  Check,
  Send,
  Loader2,
  Clock,
  Filter,
} from 'lucide-react';
import type { Entity, Episode, IntelResponse, Memory, MemoryStatus, SourceType } from '../types';
import { api } from '../api';
import { MemoryCard } from '../components/MemoryCard';

interface EntityDetailPageProps {
  entityId: number;
  onBack: () => void;
}

export const EntityDetailPage: React.FC<EntityDetailPageProps> = ({
  entityId,
  onBack,
}) => {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [intel, setIntel] = useState<IntelResponse | null>(null);

  const [activeTab, setActiveTab] = useState<'memories' | 'timeline' | 'intel' | 'ingest'>('memories');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Ingest form state
  const [ingestText, setIngestText] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('conversation');
  const [sourceDesc, setSourceDesc] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [copiedIntel, setCopiedIntel] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const loadEntityData = async () => {
    try {
      setIsLoading(true);
      const [entData, memData, epData, intelData] = await Promise.all([
        api.getEntity(entityId),
        api.getEntityMemories(entityId),
        api.getEntityEpisodes(entityId),
        api.getEntityIntel(entityId),
      ]);
      setEntity(entData);
      setMemories(memData);
      setEpisodes(epData);
      setIntel(intelData);
    } catch (err: any) {
      alert(err.message || 'Failed to load entity details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEntityData();
  }, [entityId]);

  const handleUpdateStatus = async (memoryId: number, status: MemoryStatus) => {
    try {
      await api.updateMemory(memoryId, { status });
      const updatedMemories = await api.getEntityMemories(entityId);
      setMemories(updatedMemories);
      const updatedIntel = await api.getEntityIntel(entityId);
      setIntel(updatedIntel);
    } catch (err: any) {
      alert(err.message || 'Failed to update memory status');
    }
  };

  const handleDeleteMemory = async (memoryId: number) => {
    if (!confirm('Are you sure you want to permanently delete this memory?')) return;
    try {
      await api.deleteMemory(memoryId);
      setMemories(memories.filter((m) => m.id !== memoryId));
      const updatedIntel = await api.getEntityIntel(entityId);
      setIntel(updatedIntel);
    } catch (err: any) {
      alert(err.message || 'Failed to delete memory');
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;

    try {
      setIsIngesting(true);
      await api.ingest({
        entity_id: entityId,
        content: ingestText.trim(),
        source_type: sourceType,
        source_description: sourceDesc.trim() || undefined,
      });
      setIngestText('');
      setSourceDesc('');
      await loadEntityData();
      setActiveTab('memories');
    } catch (err: any) {
      alert(err.message || 'Ingestion failed');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleCopyIntel = () => {
    if (!intel?.formatted_prompt) return;
    navigator.clipboard.writeText(intel.formatted_prompt);
    setCopiedIntel(true);
    setTimeout(() => setCopiedIntel(false), 2000);
  };

  const handleCopyId = () => {
    if (!entity?.external_id) return;
    navigator.clipboard.writeText(entity.external_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  // Topics list for filtering
  const uniqueTopics = Array.from(
    new Set(memories.map((m) => m.topic_name).filter(Boolean) as string[])
  );

  const filteredMemories = memories.filter((m) => {
    if (selectedTopic !== 'all' && m.topic_name !== selectedTopic) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });

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
        <Loader2 className="spinner spinner-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="page-container">
      {/* Back button */}
      <button
        className="btn btn-ghost btn-sm mb-4"
        onClick={onBack}
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft size={14} />
        <span>Back to Entities</span>
      </button>

      {/* Entity Profile Header */}
      <div
        className="card mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(22, 24, 50, 0.9), rgba(17, 18, 35, 0.9))',
          borderColor: 'var(--border-primary)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--accent-gradient)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                fontWeight: 700,
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              {entity.name ? entity.name[0].toUpperCase() : 'E'}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {entity.name || 'Unnamed Entity'}
                </h1>
                <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                  {entity.entity_type}
                </span>
                <span className="badge badge-success">
                  {memories.length} Active Fact{memories.length === 1 ? '' : 's'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span>
                  External ID:{' '}
                  <code style={{ color: 'var(--text-accent)', background: 'rgba(0, 0, 0, 0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                    {entity.external_id}
                  </code>
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', height: 'auto' }}
                  onClick={handleCopyId}
                  title="Copy External ID"
                >
                  {copiedId ? <Check size={12} color="var(--success)" /> : <Copy size={12} color="var(--text-muted)" />}
                </button>
                <span>&bull;</span>
                <span>Tracked since {formatDate(entity.created_at)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={() => setActiveTab('ingest')}>
              <Sparkles size={15} />
              <span>Ingest New Interaction</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'memories' ? 'active' : ''}`}
          onClick={() => setActiveTab('memories')}
        >
          <Brain size={15} style={{ display: 'inline', marginRight: '6px' }} />
          Knowledge & Memories ({memories.length})
        </button>

        <button
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Clock size={15} style={{ display: 'inline', marginRight: '6px' }} />
          Episode Timeline ({episodes.length})
        </button>

        <button
          className={`tab ${activeTab === 'intel' ? 'active' : ''}`}
          onClick={() => setActiveTab('intel')}
        >
          <FileText size={15} style={{ display: 'inline', marginRight: '6px' }} />
          AI Prompt Intel Preview
        </button>

        <button
          className={`tab ${activeTab === 'ingest' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingest')}
        >
          <Sparkles size={15} style={{ display: 'inline', marginRight: '6px' }} />
          Direct Ingestion
        </button>
      </div>

      {/* TAB 1: MEMORIES */}
      {activeTab === 'memories' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={13} /> Topic:
              </span>
              <button
                className={`btn btn-sm ${selectedTopic === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTopic('all')}
              >
                All Topics
              </button>
              {uniqueTopics.map((top) => (
                <button
                  key={top}
                  className={`btn btn-sm ${selectedTopic === top ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedTopic(top)}
                >
                  #{top}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
              {(['all', 'confirmed', 'active', 'rejected', 'superseded'] as const).map((st) => (
                <button
                  key={st}
                  className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setStatusFilter(st)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredMemories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredMemories.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  memory={mem}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={handleDeleteMemory}
                />
              ))}
            </div>
          ) : (
            <div className="card empty-state">
              <Brain className="empty-state-icon" />
              <h4 className="empty-state-title">No Memories Matching Filter</h4>
              <p className="empty-state-text">
                {memories.length === 0
                  ? 'No knowledge has been extracted for this entity yet. Ingest an interaction to extract facts.'
                  : 'Try selecting a different topic or status filter.'}
              </p>
              {memories.length === 0 && (
                <button className="btn btn-primary" onClick={() => setActiveTab('ingest')}>
                  <Sparkles size={15} />
                  <span>Ingest First Interaction</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EPISODE TIMELINE */}
      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {episodes.map((ep) => (
            <div key={ep.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge badge-info" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {ep.source_type}
                  </span>
                  {ep.source_description && (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ep.source_description}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  {formatDate(ep.created_at)}
                </span>
              </div>

              <div
                style={{
                  padding: '14px 18px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {ep.content}
              </div>
            </div>
          ))}

          {episodes.length === 0 && (
            <div className="card empty-state">
              <FileText className="empty-state-icon" />
              <h4 className="empty-state-title">No Episodes Recorded</h4>
              <p className="empty-state-text">
                Episodes represent the raw incoming dialogue, emails, or notes before claim extraction.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI PROMPT INTEL PREVIEW */}
      {activeTab === 'intel' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 className="card-title">Formatted Intelligence for LLM System Prompt</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                This is the exact structured block generated by ClueState to paste into your LLM prompt.
              </p>
            </div>

            <button className="btn btn-primary btn-sm" onClick={handleCopyIntel}>
              {copiedIntel ? (
                <>
                  <Check size={14} />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy System Prompt Block</span>
                </>
              )}
            </button>
          </div>

          <pre className="intel-preview">
            {intel?.formatted_prompt || 'No formatted intel available.'}
          </pre>

          <div style={{ marginTop: '16px', display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>&bull; Estimated Tokens: ~{Math.round((intel?.formatted_prompt?.length || 0) / 4)} tokens</span>
            <span>&bull; Active Claims: {intel?.total_memories ?? 0}</span>
            <span>&bull; Ingested Interactions: {intel?.total_episodes ?? 0}</span>
          </div>
        </div>
      )}

      {/* TAB 4: DIRECT INGESTION */}
      {activeTab === 'ingest' && (
        <div className="card" style={{ maxWidth: '720px' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--accent-primary)" />
            Ingest Knowledge for {entity.name}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Paste any interaction with {entity.name}. The engine will call the LLM to extract facts, evaluate confidence scores, and update existing memories.
          </p>

          <form onSubmit={handleIngest}>
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Source Type</label>
                <select
                  className="input"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                >
                  <option value="conversation">Conversation / Chat</option>
                  <option value="email">Email</option>
                  <option value="support_ticket">Support Ticket</option>
                  <option value="call_transcript">Call Transcript</option>
                  <option value="review">Review / Feedback</option>
                  <option value="note">Internal Staff Note</option>
                  <option value="custom">Other</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Source Description (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Q3 renewal discussion"
                  value={sourceDesc}
                  onChange={(e) => setSourceDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Content / Transcript *</label>
              <textarea
                className="input"
                style={{ minHeight: '160px', fontSize: '13px' }}
                placeholder={`Example:
User: "Hey! Just wanted to let you know we're moving our deployment to AWS next week. Also, our primary contact is now David Miller instead of Sarah. Budget is locked at $50k/year."
Support: "Noted! We'll make sure your account reflects the new AWS config."`}
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isIngesting || !ingestText.trim()}
              >
                {isIngesting ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    <span>Extracting Claims with LLM...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Run Extraction & Merge</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
