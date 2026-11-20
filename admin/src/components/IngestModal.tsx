import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  ArrowRight,
  FilePlus2,
  ShieldCheck,
  Paperclip,
  Clock,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import type { Entity, IngestResponse } from '../types';
import { api } from '../api';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetEntityId?: number;
  onIngestComplete?: (result: IngestResponse) => void;
}

const ACCEPTED_FILES = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md,.csv,.json,.eml';

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  presetEntityId,
  onIngestComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<'sync' | 'async'>('sync');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadEntities();
      loadSourceTypes();
      setResult(null);
      setError(null);
      setFiles([]);
      setMode('sync');
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

  const handleFilePick = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const next = [...files, ...Array.from(picked)];
    setFiles(next);
    // Default to async queue when attaching images/PDFs so heavy vision/OCR never blocks UI
    setMode('async');
  };

  const handleRemoveFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && files.length === 0) {
      setError('Provide source text or attach at least one photo, screenshot, PDF, or document.');
      return;
    }

    if (!selectedEntityId && !externalId.trim()) {
      setError('Select an existing profile or provide an External ID.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const finalSourceType = isCustomSourceType
        ? customSourceTypeInput.trim() || 'custom'
        : sourceType;

      let res: IngestResponse;

      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        if (content.trim()) fd.append('content', content.trim());
        fd.append('source_type', finalSourceType);
        if (sourceDescription.trim()) fd.append('source_description', sourceDescription.trim());
        fd.append('mode', mode);
        if (selectedEntityId) {
          fd.append('entity_id', selectedEntityId);
        } else {
          fd.append('external_id', externalId.trim());
          fd.append('entity_name', entityName.trim() || externalId.trim());
          fd.append('auto_create_entity', 'true');
        }
        res = await api.ingestUpload(fd);
      } else {
        const payload: any = {
          content: content.trim(),
          source_type: finalSourceType,
          source_description: sourceDescription.trim(),
          mode,
          queue_on_error: true,
        };
        if (selectedEntityId) {
          payload.entity_id = Number(selectedEntityId);
        } else {
          payload.external_id = externalId.trim();
          payload.entity_name = entityName.trim() || externalId.trim();
          payload.auto_create_entity = true;
        }
        res = await api.ingest(payload);
      }

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
    setFiles([]);
    setMode('sync');
    setSourceDescription('');
    setError(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: result ? '640px' : '580px' }}
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
            <span>
              {result
                ? result.job_status === 'queued'
                  ? 'Queued for Processing'
                  : 'Extraction Summary'
                : 'Ingest Source Record'}
            </span>
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            className="signal-strip danger"
            style={{
              background: 'var(--signal-red-bg)',
              color: 'var(--signal-red)',
              marginBottom: '14px',
              fontSize: '12.5px',
            }}
          >
            {error}
          </div>
        )}

        {result ? (
          <div>
            {result.job_status === 'queued' ? (
              <div
                className="signal-strip"
                style={{
                  background: 'var(--bg-ice)',
                  marginBottom: '18px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <Clock size={18} color="var(--ultramarine)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                    Persisted &amp; Queued (Job #{result.job_id})
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                    Your source record and attached media are safely persisted in Episode #{result.episode_id}. The background worker is transcribing, extracting, and verifying claims with automatic retries if the LLM provider hiccups.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="signal-strip verified"
                  style={{
                    background: 'var(--bg-ice)',
                    marginBottom: '16px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                  }}
                >
                  <Check size={18} color="var(--teal)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--teal)' }}>
                      Extracted {result.memories_extracted} Claim{result.memories_extracted === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {result.memories_new} new · {result.memories_updated} corroborated/superseded
                      {result.judge_applied ? ' · Audited by Critic' : ''}
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
                        className={`signal-strip ${m.status === 'pending_review' ? 'pending_review' : 'verified'}`}
                        style={{ background: 'var(--bg-ice)' }}
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
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {m.claim}
                        </div>
                        {ev && (
                          <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span className="mono">&ldquo;{ev.excerpt}&rdquo;</span>
                            {ev.is_verified && (
                              <span style={{ color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
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
              </>
            )}

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
                    placeholder="e.g. clinical_intake, lab_report"
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
                  placeholder="e.g. Intake form scan, Q4 review call"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Multimodal File Attachments (Photos, Screenshots, GIFs, PDFs, DOCX, TXT) */}
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="input-label" style={{ margin: 0 }}>
                  Attach Photos, Screenshots, PDFs or Docs (Optional)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={12} />
                  <span>Add Files</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILES}
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFilePick(e.target.files);
                  e.target.value = '';
                }}
              />
              {files.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {files.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className="surface-ice"
                      style={{
                        padding: '8px 12px',
                        borderLeft: '3px solid var(--ultramarine)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {f.type.startsWith('image/') ? (
                          <ImageIcon size={14} color="var(--ultramarine)" />
                        ) : (
                          <FileText size={14} color="var(--teal)" />
                        )}
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {formatSize(f.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleRemoveFile(idx)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="surface-ice"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  PNG, JPG, WEBP, GIF, PDF (native &amp; scanned), DOCX, TXT, MD, CSV — transcribed verbatim before claim extraction.
                </div>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">
                Source Text / Transcript {files.length === 0 ? '*' : '(Optional caption or notes)'}
              </label>
              <textarea
                className="input"
                style={{ minHeight: '110px', fontSize: '13px' }}
                placeholder="Paste any consultation note, conversation transcript, intake form, or support ticket..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required={files.length === 0}
              />
            </div>

            {/* Processing Mode Toggle */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border-subtle)',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                PROCESSING MODE
              </span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-option ${mode === 'sync' ? 'active' : ''}`}
                  onClick={() => setMode('sync')}
                >
                  Sync (Wait for Result)
                </button>
                <button
                  type="button"
                  className={`segmented-option ${mode === 'async' ? 'active' : ''}`}
                  onClick={() => setMode('async')}
                >
                  Async Queue (Auto-Retry)
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || (!content.trim() && files.length === 0)}
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner" style={{ borderTopColor: '#fff' }} />
                    <span>{mode === 'async' ? 'Queuing…' : 'Transcribing & Extracting…'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'async' ? 'Enqueue for Processing' : 'Extract & Resolve State'}</span>
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
