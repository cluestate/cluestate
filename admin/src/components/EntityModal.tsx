import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
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
      setError(err.message || 'Failed to create profile');
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
      <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} />
            <span>Create Profile / Entity</span>
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
            <label className="input-label">Display Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Dr. Elena Rostova, Patient #402, Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !externalId && generateExternalId()}
              autoFocus
            />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label className="input-label" style={{ margin: 0 }}>
                External Identifier (Unique Key) *
              </label>
              {name && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={generateExternalId}
                >
                  Generate key
                </button>
              )}
            </div>
            <input
              type="text"
              className="input mono"
              placeholder="e.g. patient_8841, cust_402, org_acme"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              required
            />
            <span className="input-hint">
              Matches the primary user, patient, or account ID in your EHR, CRM, or database.
            </span>
          </div>

          <div className="input-group">
            <label className="input-label">Profile Classification</label>
            <select
              className="input"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
            >
              <option value="person">Person (Patient, Client, User, Guest)</option>
              <option value="organization">Organization (Clinic, Company, Account)</option>
              <option value="product">Product (Service, Treatment, Software)</option>
              <option value="location">Location (Facility, Branch, Venue)</option>
              <option value="custom">Custom Record</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
