import React, { useState } from 'react';
import { X, UserPlus, Sparkles } from 'lucide-react';
import type { EntityType } from '../types';

interface EntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    external_id: string;
    name: string;
    entity_type: EntityType;
    meta?: Record<string, any>;
  }) => Promise<void>;
}

export const EntityModal: React.FC<EntityModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('person');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalId.trim()) {
      setError('External ID is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        name: name.trim() || externalId.trim(),
        external_id: externalId.trim(),
        entity_type: entityType,
      });
      setName('');
      setExternalId('');
      setEntityType('person');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create entity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateExternalId = () => {
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const randomSuffix = Math.floor(Math.random() * 900 + 100);
    setExternalId(`${slug}_${randomSuffix}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={20} color="var(--accent-primary)" />
            Track New Entity
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Entity Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Alice Chen, Acme Corp, MacBook Pro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !externalId && generateExternalId()}
            />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="input-label" style={{ margin: 0 }}>
                External ID (Unique Key) *
              </label>
              {name && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: '11px', height: 'auto' }}
                  onClick={generateExternalId}
                >
                  <Sparkles size={11} /> Auto-generate
                </button>
              )}
            </div>
            <input
              type="text"
              className="input"
              placeholder="e.g. user_9824, org_acme, patient_540"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Matches your application's user ID, customer ID, or account ID.
            </span>
          </div>

          <div className="input-group">
            <label className="input-label">Entity Type</label>
            <select
              className="input"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
            >
              <option value="person">Person (User, Customer, Patient, Guest)</option>
              <option value="organization">Organization (Company, Team, Vendor)</option>
              <option value="product">Product (Service, Hardware, Software)</option>
              <option value="location">Location (Venue, Hotel, Branch)</option>
              <option value="custom">Custom Entity</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Start Tracking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
