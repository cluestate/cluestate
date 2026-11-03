import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, ArrowRight, Loader2 } from 'lucide-react';
import type { Entity, IngestResponse } from '../types';
import { api } from '../api';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetEntityId?: number;
  onIngestComplete?: (result: IngestResponse) => void;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  presetEntityId,
  onIngestComplete,
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(
    presetEntityId ? String(presetEntityId) : ''
  );
  const [externalId, setExternalId] = useState('');
  const [entityName, setEntityName] = useState('');
  const [sourceType, setSourceType] = useState<string>('conversation');
  const [availableSourceTypes, setAvailableSourceTypes] = useState<string[]>([
    'conversation',
    'note',
    'interaction',
    'custom',
  ]);
  const [isCustomSourceType, setIsCustomSourceType] = useState(false);
  const [customSourceTypeInput, setCustomSourceTypeInput] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadEntities();
      loadSourceTypes();
      setResult(null);
      setError(null);
      setIsCustomSourceType(false);
      setCustomSourceTypeInput('');
      if (presetEntityId) {
        setSelectedEntityId(String(presetEntityId));
      }
    }
  }, [isOpen, presetEntityId]);

  const loadEntities = async () => {
    try {
      const data = await api.listEntities('', 100);
      setEntities(data);
    } catch {
      // Ignore entity load error
    }
  };

  const loadSourceTypes = async () => {
    try {
      const res = await api.getSourceTypes();
      if (res && res.source_types && res.source_types.length > 0) {
        setAvailableSourceTypes(res.source_types);
      }
    } catch {
      // Keep defaults
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Text content is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const finalSourceType = isCustomSourceType
        ? (customSourceTypeInput.trim() || 'custom')
        : sourceType;

      const payload: any = {
        content: content.trim(),
        source_type: finalSourceType,
        source_description: sourceDescription.trim(),
      };

      if (selectedEntityId) {
        payload.entity_id = Number(selectedEntityId);
      } else {
        if (!externalId.trim()) {
          setError('Please select an existing entity or provide an External ID');
          setIsSubmitting(false);
          return;
        }
        payload.external_id = externalId.trim();
        payload.entity_name = entityName.trim() || externalId.trim();
        payload.auto_create_entity = true;
      }

      const res = await api.ingest(payload);
      setResult(res);
      if (onIngestComplete) {
        onIngestComplete(res);
      }
    } catch (err: any) {
      setError(err.message || 'Ingestion failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setContent('');
    setSourceDescription('');
    setError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: result ? '680px' : '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={20} color="var(--accent-primary)" />
            {result ? 'Extraction Completed' : 'Ingest Unstructured Knowledge'}
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

        {result ? (
          <div>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '20px',
                padding: '16px',
                background: 'rgba(52, 211, 153, 0.1)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                <Check size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: '4px' }}>
                  Successfully Extracted {result.memories_extracted} Fact{result.memories_extracted === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {result.memories_new} new memor{result.memories_new === 1 ? 'y' : 'ies'} created,{' '}
                  {result.memories_updated} existing memor{result.memories_updated === 1 ? 'y' : 'ies'} updated / confirmed.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Extracted Claims:
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '280px',
                overflowY: 'auto',
                marginBottom: '24px',
              }}
            >
              {result.memories.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {m.claim}
                    </span>
                    <span className="badge badge-success" style={{ fontSize: '11px', flexShrink: 0 }}>
                      {Math.round(m.confidence * 100)}% conf
                    </span>
                  </div>
                  {m.topic_name && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--accent-primary-hover)',
                        marginTop: '6px',
                        display: 'inline-block',
                      }}
                    >
                      #{m.topic_name}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                Ingest More Text
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Target Entity</label>
              {presetEntityId ? (
                <input
                  type="text"
                  className="input"
                  disabled
                  value={`Entity #${presetEntityId}`}
                />
              ) : (
                <select
                  className="input"
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                >
                  <option value="">-- Create new or enter external ID below --</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.external_id}) &bull; {ent.entity_type}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!presetEntityId && !selectedEntityId && (
              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">External ID *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. user_101"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Entity Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Sarah Connor"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Source Type</label>
                <select
                  className="input"
                  value={isCustomSourceType ? '__custom__' : sourceType}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomSourceType(true);
                    } else {
                      setIsCustomSourceType(false);
                      setSourceType(e.target.value);
                    }
                  }}
                >
                  {availableSourceTypes.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                  <option value="__custom__">+ Define New Category...</option>
                </select>
                {isCustomSourceType && (
                  <input
                    type="text"
                    className="input"
                    style={{ marginTop: '6px' }}
                    placeholder="e.g. reflection, sprint_retro, feedback"
                    value={customSourceTypeInput}
                    onChange={(e) => setCustomSourceTypeInput(e.target.value)}
                    autoFocus
                  />
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Source Description (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Onboarding call with sales rep"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Unstructured Text / Conversation Content *</label>
              <textarea
                className="input"
                style={{ minHeight: '130px', fontSize: '13px' }}
                placeholder="Paste any dialogue, email body, support notes, or customer comments here... The engine will automatically extract atomic facts, resolve conflicts, and track confidence scores."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || !content.trim()}
                style={{ minWidth: '150px', justifyContent: 'center' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    <span>Analyzing with LLM...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Extract Memories</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
