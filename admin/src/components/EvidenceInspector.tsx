import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Tag,
  Edit3,
  Plus,
  FileText,
  Trash2,
} from 'lucide-react';
import type { Evidence, Memory, MemoryStatus, Topic } from '../types';

interface EvidenceInspectorProps {
  memory: Memory | null;
  topics?: Topic[];
  fallbackEpisodeContent?: string;
  onUpdateMemory?: (
    memoryId: number,
    data: {
      status?: MemoryStatus;
      claim?: string;
      value?: string;
      topic_id?: number | null;
    }
  ) => Promise<void>;
  onDeleteMemory?: (memoryId: number) => void;
  onPromoteToTag?: (memory: Memory) => void;
  onSelectEntity?: (entityId: number) => void;
}

export const EvidenceInspector: React.FC<EvidenceInspectorProps> = ({
  memory,
  topics = [],
  fallbackEpisodeContent,
  onUpdateMemory,
  onDeleteMemory,
  onPromoteToTag,
  onSelectEntity,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editClaim, setEditClaim] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editTopicId, setEditTopicId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    if (memory) {
      setEditClaim(memory.claim || '');
      setEditValue(memory.value || '');
      setEditTopicId(memory.topic_id ? String(memory.topic_id) : '');
    }
  }, [memory]);

  if (!memory) {
    return (
      <div className="card inspector-sticky" style={{ padding: '28px 22px', textAlign: 'center' }}>
        <FileText
          size={24}
          style={{ color: 'var(--text-muted)', margin: '0 auto 10px', opacity: 0.6 }}
        />
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Provenance &amp; Evidence Inspector
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Select any memory or claim from the ledger to inspect its character-verified source excerpt, episode transcript, and schema assignment.
        </div>
      </div>
    );
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateMemory) return;
    try {
      setIsSaving(true);
      await onUpdateMemory(memory.id, {
        claim: editClaim.trim(),
        value: editValue.trim(),
        topic_id: editTopicId ? Number(editTopicId) : null,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const renderHighlightedEpisode = (ev: Evidence) => {
    const rawText = ev.episode_content || fallbackEpisodeContent || '';
    if (!rawText) {
      return (
        <div className="episode-reader" style={{ fontStyle: 'italic' }}>
          &ldquo;{ev.excerpt}&rdquo;
        </div>
      );
    }

    if (
      ev.is_verified &&
      ev.char_start != null &&
      ev.char_end != null &&
      ev.char_start >= 0 &&
      ev.char_end <= rawText.length &&
      ev.char_start < ev.char_end
    ) {
      const before = rawText.slice(0, ev.char_start);
      const match = rawText.slice(ev.char_start, ev.char_end);
      const after = rawText.slice(ev.char_end);
      return (
        <div className="episode-reader">
          <span>{before}</span>
          <mark className="evidence-mark verified">{match}</mark>
          <span>{after}</span>
        </div>
      );
    }

    // Fallback substring locate if char offsets weren't stored
    const excerptClean = (ev.excerpt || '').trim();
    const idx = excerptClean ? rawText.toLowerCase().indexOf(excerptClean.toLowerCase()) : -1;
    if (idx !== -1) {
      const before = rawText.slice(0, idx);
      const match = rawText.slice(idx, idx + excerptClean.length);
      const after = rawText.slice(idx + excerptClean.length);
      return (
        <div className="episode-reader">
          <span>{before}</span>
          <mark className="evidence-mark verified">{match}</mark>
          <span>{after}</span>
        </div>
      );
    }

    return <div className="episode-reader">{rawText}</div>;
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

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const evidenceList = memory.evidence || [];

  return (
    <div className="card inspector-sticky" style={{ padding: '18px 20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-title" style={{ margin: 0 }}>
            Memory #{memory.id}
          </span>
          {getStatusBadge(memory.status)}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {onUpdateMemory && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setIsEditing(!isEditing)}
              title="Edit claim, value, or schema tag"
            >
              <Edit3 size={12} />
              <span>{isEditing ? 'Cancel' : 'Edit'}</span>
            </button>
          )}
          {onDeleteMemory && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              style={{ color: 'var(--danger)' }}
              onClick={() => onDeleteMemory(memory.id)}
              title="Delete memory"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Entity link if in global view */}
      {memory.entity_name && (
        <div
          style={{
            marginBottom: '10px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Profile:</span>
          <button
            type="button"
            onClick={() => onSelectEntity && onSelectEntity(memory.entity_id)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: onSelectEntity ? 'pointer' : 'default',
              textDecoration: onSelectEntity ? 'underline' : 'none',
              fontFamily: 'inherit',
              fontSize: '12.5px',
            }}
          >
            {memory.entity_name}{' '}
            {memory.entity_external_id && (
              <code style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                ({memory.entity_external_id})
              </code>
            )}
          </button>
        </div>
      )}

      {/* Claim & Value or Inline Editor */}
      {isEditing ? (
        <form
          onSubmit={handleSaveEdit}
          style={{
            padding: '12px',
            background: 'var(--bg-well)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '14px',
          }}
        >
          <div className="input-group" style={{ marginBottom: '10px' }}>
            <label className="input-label" style={{ fontSize: '11.5px' }}>
              Memory Tag / Schema Slot
            </label>
            <select
              className="input"
              style={{ fontSize: '12.5px', padding: '6px 9px' }}
              value={editTopicId}
              onChange={(e) => setEditTopicId(e.target.value)}
            >
              <option value="">— Open / Untagged Discovery —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name} {t.label ? `(${t.label})` : ''} · {t.data_type}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ marginBottom: '10px' }}>
            <label className="input-label" style={{ fontSize: '11.5px' }}>
              Normalized Value
            </label>
            <input
              type="text"
              className="input mono"
              style={{ fontSize: '12.5px', padding: '6px 9px' }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label className="input-label" style={{ fontSize: '11.5px' }}>
              Atomic Claim Statement
            </label>
            <textarea
              className="input"
              style={{ minHeight: '64px', fontSize: '12.5px', padding: '6px 9px' }}
              value={editClaim}
              onChange={(e) => setEditClaim(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-xs" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '14.5px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.45,
              marginBottom: '10px',
            }}
          >
            {memory.claim}
          </div>

          {/* Structured Tag & Value Sheet */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              padding: '10px 12px',
              background: 'var(--bg-well)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Schema Tag
              </div>
              <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {memory.topic_name ? (
                  <span className="tag-pill">
                    <Tag size={11} />
                    {memory.topic_name}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
                    open_discovery
                  </span>
                )}
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Typed Value
              </div>
              <div style={{ marginTop: '3px' }}>
                <span className="value-pill">
                  {memory.structured_value !== undefined && memory.structured_value !== null
                    ? JSON.stringify(memory.structured_value)
                    : memory.value || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Promote to Schema Tag if untagged */}
          {!memory.topic_id && onPromoteToTag && (
            <button
              type="button"
              className="btn btn-secondary btn-xs w-full"
              style={{ marginTop: '8px', justifyContent: 'center' }}
              onClick={() => onPromoteToTag(memory)}
            >
              <Plus size={12} />
              <span>Promote to Defined Schema Tag</span>
            </button>
          )}
        </div>
      )}

      {/* Quick Review Actions */}
      {onUpdateMemory && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {memory.status !== 'confirmed' && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onUpdateMemory(memory.id, { status: 'confirmed' })}
            >
              <CheckCircle2 size={14} />
              <span>Approve &amp; Confirm</span>
            </button>
          )}
          {memory.status !== 'rejected' && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onUpdateMemory(memory.id, { status: 'rejected' })}
            >
              <XCircle size={14} />
              <span>Reject Claim</span>
            </button>
          )}
        </div>
      )}

      {/* Verbatim Source Provenance */}
      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Source Provenance ({evidenceList.length})</span>
          <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
            {memory.claim_type} · {Math.round(memory.confidence * 100)}%
          </span>
        </div>

        {evidenceList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {evidenceList.map((ev, idx) => (
              <div key={ev.id || idx}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    fontSize: '11.5px',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-mono)' }}>
                    {ev.is_verified ? (
                      <span className="badge badge-success">
                        <ShieldCheck size={11} />
                        Verified{ev.char_start != null ? ` [${ev.char_start}:${ev.char_end}]` : ''}
                      </span>
                    ) : (
                      <span className="badge badge-warning">
                        <AlertTriangle size={11} />
                        Unverified Span
                      </span>
                    )}
                    {ev.episode_source_type && (
                      <span className="badge badge-neutral">{ev.episode_source_type}</span>
                    )}
                  </span>

                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Ep #{ev.episode_id}
                  </span>
                </div>

                {renderHighlightedEpisode(ev)}

                {ev.content_hash && (
                  <div
                    className="mono"
                    style={{
                      marginTop: '4px',
                      fontSize: '10.5px',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>SHA-256: {ev.content_hash.slice(0, 16)}…</span>
                    {ev.episode_occurred_at && <span>{formatDate(ev.episode_occurred_at)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '14px',
              background: 'var(--bg-well)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            No source evidence excerpt linked to this memory.
          </div>
        )}
      </div>

      {/* Temporal Validity Footer */}
      <div
        style={{
          paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11.5px',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Valid From:</span>
          <span>{formatDate(memory.valid_from || memory.created_at)}</span>
        </div>
        {memory.valid_to && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Valid To / Expires:</span>
            <span>{formatDate(memory.valid_to)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Recorded:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} />
            {formatDate(memory.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};
