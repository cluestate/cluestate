import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Trash2,
} from 'lucide-react';
import type { Memory, MemoryStatus } from '../types';

interface MemoryCardProps {
  memory: Memory;
  isSelected?: boolean;
  onSelect?: (memory: Memory) => void;
  onUpdateStatus?: (memoryId: number, status: MemoryStatus) => void;
  onDelete?: (memoryId: number) => void;
  showEntityName?: boolean;
  entityName?: string;
  onSelectEntity?: (entityId: number) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  isSelected,
  onSelect,
  onUpdateStatus,
  onDelete,
  showEntityName,
  entityName,
  onSelectEntity,
}) => {
  const firstEv = memory.evidence && memory.evidence.length > 0 ? memory.evidence[0] : null;
  const isSafetyOrReview =
    memory.status === 'pending_review' ||
    memory.status === 'rejected' ||
    (memory.topic_name &&
      /(allergy|allergies|medical|restriction|condition|compliance)/.test(
        memory.topic_name.toLowerCase()
      ));

  const stripClass =
    memory.status === 'pending_review' || memory.status === 'rejected' || isSafetyOrReview
      ? 'status-pending_review'
      : memory.status === 'confirmed' || firstEv?.is_verified
        ? 'status-confirmed'
        : memory.status === 'superseded'
          ? 'status-superseded'
          : '';

  const getSignalIndicator = () => {
    if (memory.status === 'pending_review') {
      return <span className="badge badge-warning">SAFETY / REVIEW</span>;
    }
    if (memory.status === 'rejected') {
      return <span className="badge badge-danger">REJECTED</span>;
    }
    if (memory.status === 'superseded') {
      return <span className="badge badge-neutral">SUPERSEDED</span>;
    }
    if (memory.status === 'confirmed' || firstEv?.is_verified) {
      return (
        <span className="badge badge-success">
          VERIFIED
          {firstEv?.char_start != null ? ` [${firstEv.char_start}:${firstEv.char_end}]` : ''}
        </span>
      );
    }
    return <span className="badge badge-info">ACTIVE</span>;
  };

  const displayValue =
    memory.structured_value !== undefined && memory.structured_value !== null
      ? typeof memory.structured_value === 'object'
        ? JSON.stringify(memory.structured_value)
        : String(memory.structured_value)
      : memory.value;

  return (
    <div
      className={`memory-card ${stripClass} ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect && onSelect(memory)}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
    >
      {/* Top Signal Micro-Header (Landing-Page Hero Card Style) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {showEntityName && (
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11.5px',
                color: 'var(--text-primary)',
                fontWeight: 700,
                cursor: onSelectEntity ? 'pointer' : 'default',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectEntity) onSelectEntity(memory.entity_id);
              }}
            >
              {entityName || memory.entity_name || `Entity #${memory.entity_id}`} ·
            </button>
          )}

          <span className="tag-pill">
            {memory.topic_name ? memory.topic_name.replace(/_/g, ' ') : 'OPEN DISCOVERY'}
          </span>

          {displayValue && (
            <span className="value-pill">· {displayValue}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {getSignalIndicator()}

          <div className="memory-actions" onClick={(e) => e.stopPropagation()}>
            {onUpdateStatus && memory.status !== 'confirmed' && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                title="Approve & Confirm"
                onClick={() => onUpdateStatus(memory.id, 'confirmed')}
                style={{ color: 'var(--teal)' }}
              >
                <CheckCircle2 size={14} />
              </button>
            )}
            {onUpdateStatus && memory.status !== 'rejected' && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                title="Reject claim"
                onClick={() => onUpdateStatus(memory.id, 'rejected')}
                style={{ color: 'var(--signal-red)' }}
              >
                <XCircle size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                title="Delete claim"
                onClick={() => onDelete(memory.id)}
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Bold Claim Statement */}
      <div className="memory-claim">{memory.claim}</div>

      {/* Subdued Quote Preview */}
      {firstEv && firstEv.excerpt && (
        <div className="memory-evidence">
          &ldquo;{firstEv.excerpt}&rdquo;
        </div>
      )}

      {/* Critic / Judge Diagnostic Note */}
      {memory.judge_note && (
        <div
          className="mono"
          style={{
            marginTop: '6px',
            fontSize: '11.5px',
            color: memory.status === 'pending_review' ? 'var(--signal-red)' : 'var(--ultramarine)',
            lineHeight: 1.4,
          }}
        >
          AUDIT NOTE · {memory.judge_note}
        </div>
      )}
    </div>
  );
};
