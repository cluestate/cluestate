import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Trash2,
  Tag,
  Clock,
  ShieldCheck,
  AlertTriangle,
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
  const getStatusBadge = (status: MemoryStatus) => {
    switch (status) {
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
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const firstEv = memory.evidence && memory.evidence.length > 0 ? memory.evidence[0] : null;
  const displayValue =
    memory.structured_value !== undefined && memory.structured_value !== null
      ? typeof memory.structured_value === 'object'
        ? JSON.stringify(memory.structured_value)
        : String(memory.structured_value)
      : memory.value;

  return (
    <div
      className={`memory-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect && onSelect(memory)}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
    >
      <div className="memory-card-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {showEntityName && (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: onSelectEntity ? 'pointer' : 'default',
                  textDecoration: onSelectEntity ? 'underline' : 'none',
                  fontFamily: 'inherit',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectEntity) onSelectEntity(memory.entity_id);
                }}
              >
                {entityName || memory.entity_name || `Entity #${memory.entity_id}`}
              </button>
            )}

            {memory.topic_name ? (
              <span className="tag-pill">
                <Tag size={11} />
                {memory.topic_name}
              </span>
            ) : (
              <span className="badge badge-neutral">open_discovery</span>
            )}

            {displayValue && (
              <span className="value-pill">= {displayValue}</span>
            )}

            {getStatusBadge(memory.status)}
          </div>

          <div className="memory-claim">{memory.claim}</div>
        </div>

        <div className="memory-actions" onClick={(e) => e.stopPropagation()}>
          {onUpdateStatus && memory.status !== 'confirmed' && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              title="Approve & Confirm"
              onClick={() => onUpdateStatus(memory.id, 'confirmed')}
              style={{ color: 'var(--success)' }}
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
              style={{ color: 'var(--danger)' }}
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

      {/* Excerpt preview & Provenance Metadata */}
      {firstEv && firstEv.excerpt && (
        <div className="memory-evidence">
          &ldquo;{firstEv.excerpt}&rdquo;
        </div>
      )}

      <div className="memory-meta">
        {firstEv ? (
          firstEv.is_verified ? (
            <span className="badge badge-success">
              <ShieldCheck size={11} />
              Verified{firstEv.char_start != null ? ` [${firstEv.char_start}:${firstEv.char_end}]` : ''}
            </span>
          ) : (
            <span className="badge badge-warning">
              <AlertTriangle size={11} />
              Unverified Quote
            </span>
          )
        ) : (
          <span className="badge badge-neutral">Manual / No Quote</span>
        )}

        <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
          {memory.claim_type}
        </span>

        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {Math.round(memory.confidence * 100)}% conf
        </span>

        <span
          className="mono"
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Clock size={11} />
          {formatDate(memory.created_at)}
        </span>
      </div>
    </div>
  );
};
