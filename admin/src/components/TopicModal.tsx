import React, { useState } from 'react';
import { X, Tag, Info } from 'lucide-react';
import type { Topic } from '../types';

interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    data_type: string;
    enum_values?: string[];
  }) => Promise<void>;
  initialTopic?: Topic | null;
}

export const TopicModal: React.FC<TopicModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialTopic,
}) => {
  const [name, setName] = useState(initialTopic?.name || '');
  const [description, setDescription] = useState(initialTopic?.description || '');
  const [dataType, setDataType] = useState(initialTopic?.data_type || 'text');
  const [enumValuesStr, setEnumValuesStr] = useState(
    initialTopic?.enum_values ? initialTopic.enum_values.join(', ') : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Topic name is required');
      return;
    }

    const enumValues = enumValuesStr
      ? enumValuesStr.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        name: name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description: description.trim(),
        data_type: dataType,
        enum_values: enumValues,
      });
      setName('');
      setDescription('');
      setDataType('text');
      setEnumValuesStr('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save topic');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tag size={20} color="var(--accent-primary)" />
            {initialTopic ? 'Edit Topic' : 'Add Memory Topic'}
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
            <label className="input-label">Topic Identifier (Slug) *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. preferences, pain_points, budget, dietary_restrictions"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!!initialTopic}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Used by LLMs to categorize extracted claims.
            </span>
          </div>

          <div className="input-group">
            <label className="input-label">Description & LLM Extraction Instructions</label>
            <textarea
              className="input"
              style={{ minHeight: '80px' }}
              placeholder="e.g. Specific likes, dislikes, habits, dietary choices, or interaction preferences expressed by the user."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Expected Data Type</label>
            <select
              className="input"
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
            >
              <option value="text">Free Text / Claim</option>
              <option value="list">List of Values</option>
              <option value="number">Numeric (e.g. budget, quantity, score)</option>
              <option value="boolean">Boolean (True / False flag)</option>
              <option value="enum">Constrained Set (Enum)</option>
            </select>
          </div>

          {dataType === 'enum' && (
            <div className="input-group">
              <label className="input-label">Allowed Values (Comma-separated)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. low, medium, high, critical"
                value={enumValuesStr}
                onChange={(e) => setEnumValuesStr(e.target.value)}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              padding: '12px',
              background: 'rgba(99, 102, 241, 0.08)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <Info size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              The LLM will automatically scan incoming interactions and classify relevant facts into this topic category with source evidence.
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : initialTopic ? 'Update Topic' : 'Create Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
