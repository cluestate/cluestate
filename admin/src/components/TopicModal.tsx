import React, { useState, useEffect } from 'react';
import { X, Tag, Info } from 'lucide-react';
import type { Topic, TopicCardinality, UpdatePolicy } from '../types';

interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    data_type: string;
    cardinality: TopicCardinality;
    update_policy: UpdatePolicy;
    temporal: boolean;
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
  const [cardinality, setCardinality] = useState<TopicCardinality>(initialTopic?.cardinality || 'multiple');
  const [updatePolicy, setUpdatePolicy] = useState<UpdatePolicy>(initialTopic?.update_policy || 'append');
  const [temporal, setTemporal] = useState<boolean>(initialTopic?.temporal || false);
  const [enumValuesStr, setEnumValuesStr] = useState(
    initialTopic?.enum_values ? initialTopic.enum_values.join(', ') : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTopic) {
      setName(initialTopic.name);
      setDescription(initialTopic.description);
      setDataType(initialTopic.data_type);
      setCardinality(initialTopic.cardinality || 'multiple');
      setUpdatePolicy(initialTopic.update_policy || 'append');
      setTemporal(!!initialTopic.temporal);
      setEnumValuesStr(initialTopic.enum_values ? initialTopic.enum_values.join(', ') : '');
    } else {
      setName('');
      setDescription('');
      setDataType('text');
      setCardinality('multiple');
      setUpdatePolicy('append');
      setTemporal(false);
      setEnumValuesStr('');
    }
  }, [initialTopic, isOpen]);

  if (!isOpen) return null;

  const handleCardinalityChange = (nextCardinality: TopicCardinality) => {
    setCardinality(nextCardinality);
    if (nextCardinality === 'single' && updatePolicy === 'append') {
      setUpdatePolicy('replace');
    } else if (nextCardinality === 'multiple' && updatePolicy === 'replace') {
      setUpdatePolicy('append');
    }
  };

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
        cardinality,
        update_policy: updatePolicy,
        temporal,
        enum_values: enumValues,
      });
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
            {initialTopic ? 'Edit State Schema Topic' : 'Add State Schema Topic'}
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
              placeholder="e.g. shoe_preferences, contract_budget, account_tier"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!!initialTopic}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Description & Extraction Rules</label>
            <textarea
              className="input"
              style={{ minHeight: '72px' }}
              placeholder="Describe what this attribute represents and how it should be extracted."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group">
              <label className="input-label">Data Type</label>
              <select
                className="input"
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
              >
                <option value="text">Text</option>
                <option value="list">List of Values</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean (True/False)</option>
                <option value="enum">Constrained Enum</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Cardinality</label>
              <select
                className="input"
                value={cardinality}
                onChange={(e) => handleCardinalityChange(e.target.value as TopicCardinality)}
              >
                <option value="multiple">Multiple (Coexisting claims)</option>
                <option value="single">Single (One active value)</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Conflict & Update Policy</label>
            <select
              className="input"
              value={updatePolicy}
              onChange={(e) => setUpdatePolicy(e.target.value as UpdatePolicy)}
            >
              <option value="append">Append — New claims coexist unless explicitly contradicted</option>
              <option value="replace">Replace — Newer claims automatically supersede older claims</option>
              <option value="review">Review — Preserve confirmed claims and add new claims alongside</option>
            </select>
          </div>

          {dataType === 'enum' && (
            <div className="input-group">
              <label className="input-label">Allowed Enum Values (Comma-separated)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. starter, growth, enterprise"
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
              <strong>Single + Replace</strong> ensures only one active value exists (e.g., current budget).{' '}
              <strong>Multiple + Append</strong> lets multiple preferences coexist (e.g., likes Nike and Salomon shoes).
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
