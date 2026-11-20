import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Plus,
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
      <div className="inspector-plane" style={{ padding: '32px 24px' }}>
        <div className="card-title" style={{ marginBottom: '6px' }}>
          SOURCE PROVENANCE
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Select any signal strip on the left to inspect its verbatim source quote, exact character span, and episode transcript.
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

  const getStatusSignal = (st: MemoryStatus) => {
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
  const firstEv = evidenceList[0];

  return (
    <div className="inspector-plane">
      {/* Top Status & Edit Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="card-title" style={{ margin: 0 }}>
            SOURCE PROVENANCE
          </span>
          {firstEv?.is_verified ? (
            <span className="badge badge-success">
              VERIFIED{firstEv.char_start != null ? ` [${firstEv.char_start}:${firstEv.char_end}]` : ''}
            </span>
          ) : (
            getStatusSignal(memory.status)
          )}
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
              style={{ color: 'var(--signal-red)' }}
              onClick={() => onDeleteMemory(memory.id)}
              title="Delete memory"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Entity reference when inspecting in global Review Queue */}
      {memory.entity_name && (
        <div
          style={{
            marginBottom: '12px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="mono" style={{ fontSize: '10.5px', textTransform: 'uppercase' }}>
            PROFILE
          </span>
          <button
            type="button"
            onClick={() => onSelectEntity && onSelectEntity(memory.entity_id)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontWeight: 700,
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

      {/* Inline Editor or Selected Claim Summary */}
      {isEditing ? (
        <form
          onSubmit={handleSaveEdit}
          style={{
            padding: '14px',
            background: '#FFFFFF',
            borderLeft: '3px solid var(--ultramarine)',
            marginBottom: '16px',
          }}
        >
          <div className="input-group" style={{ marginBottom: '10px' }}>
            <label className="input-label">Schema Tag</label>
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
            <label className="input-label">Typed Value</label>
            <input
              type="text"
              className="input mono"
              style={{ fontSize: '12.5px', padding: '6px 9px' }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label className="input-label">Atomic Claim</label>
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
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div
            className="mono"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--ultramarine)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            {memory.topic_name || 'OPEN_DISCOVERY'}
            {memory.value ? ` = ${memory.value}` : ''}
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
            }}
          >
            {memory.claim}
          </div>

          {!memory.topic_id && onPromoteToTag && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              style={{ marginTop: '10px' }}
              onClick={() => onPromoteToTag(memory)}
            >
              <Plus size={12} />
              <span>Promote to Schema Tag</span>
            </button>
          )}
        </div>
      )}

      {/* Verbatim Source Transcript with Teal Highlight */}
      <div style={{ marginBottom: '16px' }}>
        {evidenceList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {evidenceList.map((ev, idx) => (
              <div key={ev.id || idx}>
                {renderHighlightedEpisode(ev)}

                <div
                  className="mono"
                  style={{
                    marginTop: '8px',
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <span>
                    EPISODE #{ev.episode_id}
                    {ev.episode_source_type ? ` · ${ev.episode_source_type.toUpperCase()}` : ''}
                  </span>
                  {ev.content_hash && <span>SHA-256: {ev.content_hash.slice(0, 12)}…</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '14px',
              background: '#FFFFFF',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            No source transcript excerpt linked to this memory.
          </div>
        )}
      </div>

      {/* Review Decision Bar */}
      {onUpdateMemory && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {memory.status !== 'confirmed' && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onUpdateMemory(memory.id, { status: 'confirmed' })}
            >
              <CheckCircle2 size={13} />
              <span>Confirm Claim</span>
            </button>
          )}
          {memory.status !== 'rejected' && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onUpdateMemory(memory.id, { status: 'rejected' })}
            >
              <XCircle size={13} />
              <span>Reject</span>
            </button>
          )}
        </div>
      )}

      {/* Temporal Metadata */}
      <div
        className="mono"
        style={{
          marginTop: '14px',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {memory.claim_type.toUpperCase()} · {Math.round(memory.confidence * 100)}%
        </span>
        <span>{formatDate(memory.valid_from || memory.created_at)}</span>
      </div>
    </div>
  );
};
