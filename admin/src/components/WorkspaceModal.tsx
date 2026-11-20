import React, { useState } from 'react';
import { X, Building2, Copy } from 'lucide-react';
import type { Workspace } from '../types';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  onSubmit: (data: {
    name: string;
    clone_schema_from_workspace_id?: number | null;
  }) => Promise<void>;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  workspaces,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [cloneFromId, setCloneFromId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        name: name.trim(),
        clone_schema_from_workspace_id: cloneFromId ? Number(cloneFromId) : null,
      });
      setName('');
      setCloneFromId('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
          }}
        >
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} />
            <span>Create Isolated Workspace</span>
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '14px',
              fontSize: '12.5px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Workspace Name *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Zurich Longevity Clinic, Acme Production, Staging"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <span className="input-hint">
              Each workspace isolates its own profiles/entities, memory schema, team members, and scoped API keys.
            </span>
          </div>

          {workspaces.length > 0 && (
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Copy size={12} />
                <span>Clone Memory Schema From (Optional)</span>
              </label>
              <select
                className="input"
                value={cloneFromId}
                onChange={(e) => setCloneFromId(e.target.value)}
              >
                <option value="">— Start with a clean blank schema —</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.slug})
                  </option>
                ))}
              </select>
              <span className="input-hint">
                Copies all defined Memory Tags, discovery instructions, and source types from the selected workspace without copying entity records.
              </span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
