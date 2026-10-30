import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Trash2,
  Quote,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
} from 'lucide-react';
import type { Memory, MemoryStatus } from '../types';
import { ConfidenceBar } from './ConfidenceBar';

interface MemoryCardProps {
  memory: Memory;
  onUpdateStatus?: (memoryId: number, status: MemoryStatus) => void;
  onDelete?: (memoryId: number) => void;
  showEntityName?: boolean;
  entityName?: string;
  onSelectEntity?: (entityId: number) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({
  memory,
  onUpdateStatus,
  onDelete,
  showEntityName,
  entityName,
  onSelectEntity,
}) => {
  const [showEvidence, setShowEvidence] = useState(false);

  const getStatusBadge = (status: MemoryStatus) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge badge-success">Confirmed</span>;
      case 'active':
        return <span className="badge badge-info">Active</span>;
      case 'rejected':
        return <span className="badge badge-danger">Rejected</span>;
      case 'superseded':
        return <span className="badge badge-neutral">Superseded</span>;
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

  return (
    <div className="memory-card">
      <div className="memory-card-header">
        <div style={{ flex: 1, paddingRight: '12px' }}>
          {showEntityName && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-accent)',
                fontWeight: 600,
                cursor: onSelectEntity ? 'pointer' : 'default',
                marginBottom: '4px',
                display: 'inline-block',
              }}
              onClick={() => onSelectEntity && onSelectEntity(memory.entity_id)}
            >
              &bull; {entityName || `Entity #${memory.entity_id}`}
            </div>
          )}
          <div className="memory-claim">{memory.claim}</div>
        </div>

        <div className="memory-actions">
          {onUpdateStatus && memory.status !== 'confirmed' && (
            <button
              className="btn btn-ghost btn-sm"
              title="Confirm fact"
              onClick={() => onUpdateStatus(memory.id, 'confirmed')}
              style={{ color: 'var(--success)' }}
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {onUpdateStatus && memory.status !== 'rejected' && (
            <button
              className="btn btn-ghost btn-sm"
              title="Reject fact"
              onClick={() => onUpdateStatus(memory.id, 'rejected')}
              style={{ color: 'var(--danger)' }}
            >
              <XCircle size={15} />
            </button>
          )}
          {onDelete && (
            <button
              className="btn btn-ghost btn-sm"
              title="Delete memory"
              onClick={() => onDelete(memory.id)}
              style={{ color: 'var(--text-muted)' }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="memory-meta">
        {/* Status Badge */}
        {getStatusBadge(memory.status)}

        {/* Topic Tag */}
        {memory.topic_name && (
          <span
            className="badge"
            style={{
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--accent-primary-hover)',
              display: 'inline-flex',
              gap: '4px',
              alignItems: 'center',
            }}
          >
            <Tag size={11} />
            {memory.topic_name}
          </span>
        )}

        {/* Confidence Meter */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Confidence</span>
          <ConfidenceBar confidence={memory.confidence} />
        </div>

        {/* Timestamp */}
        <span
          style={{
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

      {/* Evidence Section */}
      {memory.evidence && memory.evidence.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowEvidence(!showEvidence)}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              color: 'var(--text-secondary)',
            }}
          >
            <Quote size={13} />
            <span>
              {memory.evidence.length} Source Evidence Quote{memory.evidence.length > 1 ? 's' : ''}
            </span>
            {showEvidence ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showEvidence && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {memory.evidence.map((ev, i) => (
                <div key={ev.id || i} className="memory-evidence">
                  &ldquo;{ev.excerpt}&rdquo;
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
