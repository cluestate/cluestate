import React, { useState, useEffect } from 'react';
import { X, Check, ArrowRight, FilePlus2, ShieldCheck } from 'lucide-react';
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
      // Ignore
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
      setError('Source text is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const finalSourceType = isCustomSourceType
        ? customSourceTypeInput.trim() || 'custom'
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
          setError('Select an existing profile or provide an External ID');
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
        style={{ maxWidth: result ? '640px' : '560px' }}
        onClick={(e) => e.stopPropagation()}
      >
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
            <FilePlus2 size={18} />
            <span>{result ? 'Extraction Summary' : 'Ingest Source Record'}</span>
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

        {result ? (
          <div>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
                padding: '12px 14px',
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                borderRadius: 'var(--radius-sm)',
                alignItems: 'center',
              }}
            >
              <Check size={18} color="var(--success)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--success)' }}>
                  Extracted {result.memories_extracted} Claim{result.memories_extracted === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {result.memories_new} new state record{result.memories_new === 1 ? '' : 's'} ·{' '}
                  {result.memories_updated} existing record{result.memories_updated === 1 ? '' : 's'} corroborated or superseded.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '300px',
                overflowY: 'auto',
                marginBottom: '20px',
              }}
            >
              {result.memories.map((m) => {
                const ev = m.evidence && m.evidence[0];
                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '11px 14px',
                      background: 'var(--bg-well)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {m.topic_name ? (
                          <span className="tag-pill">#{m.topic_name}</span>
                        ) : (
                          <span className="badge badge-neutral">open_discovery</span>
                        )}
                        {m.value && <span className="value-pill">= {m.value}</span>}
                      </div>
                      <span className={`badge ${m.status === 'pending_review' ? 'badge-warning' : 'badge-success'}`}>
                        {m.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {m.claim}
                    </div>
                    {ev && (
                      <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span className="mono">&ldquo;{ev.excerpt}&rdquo;</span>
                        {ev.is_verified && (
                          <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <ShieldCheck size={11} />
                            [{ev.char_start}:{ev.char_end}]
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                Ingest Another Record
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Target Profile / Entity</label>
              {presetEntityId ? (
                <input
                  type="text"
                  className="input"
                  disabled
                  value={`Profile #${presetEntityId}`}
                />
              ) : (
                <select
                  className="input"
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                >
                  <option value="">— Create new or enter External ID below —</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.external_id}) · {ent.entity_type}
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
                    className="input mono"
                    placeholder="e.g. patient_104, cust_201"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Display Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Clara Vance"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Provenance Source Type</label>
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
                  <option value="__custom__">+ New Source Category…</option>
                </select>
                {isCustomSourceType && (
                  <input
                    type="text"
                    className="input mono"
                    style={{ marginTop: '6px' }}
                    placeholder="e.g. clinical_intake, consultation"
                    value={customSourceTypeInput}
                    onChange={(e) => setCustomSourceTypeInput(e.target.value)}
                    autoFocus
                  />
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Reference Note (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Initial intake note, Q4 review call"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Source Text / Transcript *</label>
              <textarea
                className="input"
                style={{ minHeight: '130px', fontSize: '13px' }}
                placeholder="Paste any consultation note, conversation transcript, intake form, or support ticket..."
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
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner" style={{ borderTopColor: '#fff' }} />
                    <span>Extracting &amp; Verifying…</span>
                  </>
                ) : (
                  <>
                    <span>Extract &amp; Resolve State</span>
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
