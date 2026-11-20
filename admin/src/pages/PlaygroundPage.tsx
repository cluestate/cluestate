import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Play,
  Tag,
} from 'lucide-react';
import type { Entity, IngestResponse, SourceType } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

const BENCH_PRESETS = [
  {
    title: 'Clinical Patient Intake',
    entityName: 'Clara Lindqvist',
    externalId: 'patient_clara_409',
    sourceType: 'note' as SourceType,
    sourceDesc: 'Initial Preventive Medicine Consultation',
    content: `Physician Intake Note:
Patient Clara Lindqvist (34F) presents for annual preventive evaluation. She states she has followed a strictly vegan diet for the past 5 years (no meat, dairy, or eggs) and is gluten-free due to celiac history. Documented drug allergy to Penicillin (hives) and food allergy to tree nuts. She requests all lab results and appointment reminders via SMS rather than phone calls.`,
  },
  {
    title: 'Enterprise SaaS Discovery',
    entityName: 'Sarah Jenkins',
    externalId: 'account_sarah_j',
    sourceType: 'conversation' as SourceType,
    sourceDesc: 'Architecture & Budget Review',
    content: `Account Executive: Hi Sarah, can you walk us through your current database architecture and timeline?
Sarah: Right now we run PostgreSQL and Redis on AWS ECS with Python and FastAPI. We are hitting latency bottlenecks at peak load and have a hard deadline to finalize our new data tier before our renewal on 2026-12-15.
Account Executive: What is the approved budget envelope?
Sarah: Our VP of Engineering, David Vance, signed off on an annual software budget of $60,000.`,
  },
  {
    title: 'Priority Support Escalation',
    entityName: 'Liam Miller',
    externalId: 'cust_liam_882',
    sourceType: 'support_ticket' as SourceType,
    sourceDesc: 'Ticket #4419 — Mobile Access',
    content: `Customer Ticket:
"The biometric login fails on my iPhone 15 Pro Max running iOS 18. I travel weekly for consulting and require offline mode access. Please send status updates strictly via SMS since I rarely check email on flights."`,
  },
];

interface PlaygroundPageProps {
  onSelectEntity: (entityId: number) => void;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({
  onSelectEntity,
}) => {
  const { notify } = useToast();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [externalId, setExternalId] = useState(BENCH_PRESETS[0].externalId);
  const [entityName, setEntityName] = useState(BENCH_PRESETS[0].entityName);
  const [sourceType, setSourceType] = useState<string>(BENCH_PRESETS[0].sourceType);
  const [availableSourceTypes, setAvailableSourceTypes] = useState<string[]>([
    'conversation',
    'note',
    'interaction',
    'custom',
  ]);
  const [sourceDescription, setSourceDescription] = useState(BENCH_PRESETS[0].sourceDesc);
  const [content, setContent] = useState(BENCH_PRESETS[0].content);
  const [dryRun, setDryRun] = useState<boolean>(true);

  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [activeClaimIdx, setActiveClaimIdx] = useState<number | null>(null);

  useEffect(() => {
    loadEntities();
    api
      .getSourceTypes()
      .then((r) => {
        if (r && r.source_types && r.source_types.length > 0) {
          setAvailableSourceTypes(r.source_types);
        }
      })
      .catch(() => {});
  }, []);

  const loadEntities = async () => {
    try {
      const data = await api.listEntities('', 100);
      setEntities(data);
    } catch {
      // Ignore
    }
  };

  const applyPreset = (preset: (typeof BENCH_PRESETS)[0]) => {
    setSelectedEntityId('');
    setEntityName(preset.entityName);
    setExternalId(preset.externalId);
    setSourceType(preset.sourceType);
    setSourceDescription(preset.sourceDesc);
    setContent(preset.content);
    setResult(null);
    setActiveClaimIdx(null);
  };

  const handleRunExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      notify('Source text is required', 'error');
      return;
    }

    try {
      setIsExtracting(true);
      const payload: any = {
        content: content.trim(),
        source_type: sourceType,
        source_description: sourceDescription.trim() || undefined,
        dry_run: dryRun,
      };

      if (selectedEntityId) {
        payload.entity_id = Number(selectedEntityId);
      } else {
        payload.external_id = externalId.trim() || 'bench_' + Date.now();
        payload.entity_name = entityName.trim() || payload.external_id;
        payload.auto_create_entity = true;
      }

      const res = await api.ingest(payload);
      setResult(res);
      setActiveClaimIdx(res.memories.length > 0 ? 0 : null);
      notify(
        dryRun
          ? `Dry run simulated ${res.memories_extracted} claim(s) (no DB changes persisted)`
          : `Extracted and persisted ${res.memories_extracted} claim(s)`,
        'success'
      );
      if (!dryRun) {
        await loadEntities();
      }
    } catch (err: any) {
      notify(err.message || 'Extraction failed', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const renderHighlightedInput = () => {
    if (!result || activeClaimIdx === null || !result.memories[activeClaimIdx]) {
      return null;
    }
    const mem = result.memories[activeClaimIdx];
    const ev = mem.evidence && mem.evidence[0];
    if (!ev || ev.char_start == null || ev.char_end == null) return null;
    if (ev.char_start < 0 || ev.char_end > content.length || ev.char_start >= ev.char_end) {
      return null;
    }
    const before = content.slice(0, ev.char_start);
    const match = content.slice(ev.char_start, ev.char_end);
    const after = content.slice(ev.char_end);
    return (
      <div style={{ marginTop: '14px' }}>
        <div className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
          Verified Character Span Preview [{ev.char_start}:{ev.char_end}]
        </div>
        <div className="episode-reader" style={{ maxHeight: '180px' }}>
          <span>{before}</span>
          <mark className="evidence-mark verified">{match}</mark>
          <span>{after}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">INTERACTIVE EXTRACTION SIMULATOR</div>
          <h1 className="page-title">Extraction Bench</h1>
          <p className="page-subtitle">
            Test schema tag instructions, value coercion, and character-offset verification in Dry Run or Live Persist mode.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            MODE:
          </span>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-option ${dryRun ? 'active' : ''}`}
              onClick={() => setDryRun(true)}
            >
              Dry Run (Simulate Only)
            </button>
            <button
              type="button"
              className={`segmented-option ${!dryRun ? 'active' : ''}`}
              onClick={() => setDryRun(false)}
            >
              Persist to Workspace
            </button>
          </div>
        </div>
      </div>

      {/* Preset Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Sample Scenarios:
        </span>
        {BENCH_PRESETS.map((preset) => (
          <button
            key={preset.title}
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => applyPreset(preset)}
          >
            {preset.title}
          </button>
        ))}
      </div>

      {/* 2-Column Open Split */}
      <div className="split-ledger">
        {/* Left Column: Input Form on Pure White */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Source Transcript / Unstructured Input
            </h3>
            {dryRun && (
              <span className="badge badge-info">DRY RUN — NO DB WRITES</span>
            )}
          </div>

          <form onSubmit={handleRunExtraction}>
            <div className="input-group">
              <label className="input-label">Target Profile</label>
              <select
                className="input"
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              >
                <option value="">— Use Custom External ID below —</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} ({ent.external_id})
                  </option>
                ))}
              </select>
            </div>

            {!selectedEntityId && (
              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">External ID</label>
                  <input
                    type="text"
                    className="input mono"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Profile Name</label>
                  <input
                    type="text"
                    className="input"
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
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                >
                  {availableSourceTypes.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Reference Note</label>
                <input
                  type="text"
                  className="input"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Source Text</label>
              <textarea
                className="input"
                style={{ minHeight: '190px', fontSize: '13px', lineHeight: 1.55 }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', height: '38px' }}
              disabled={isExtracting || !content.trim()}
            >
              {isExtracting ? (
                <>
                  <div className="spinner" style={{ borderTopColor: '#fff' }} />
                  <span>Running Extraction &amp; Verification…</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>
                    {dryRun ? 'Simulate Extraction (Dry Run)' : 'Extract & Persist State'}
                  </span>
                </>
              )}
            </button>
          </form>

          {renderHighlightedInput()}
        </div>

        {/* Right Column: Live Extraction Results on Cool Ice Plane */}
        <div className="inspector-plane">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Extraction &amp; Schema Resolution Output
            </h3>

            {result && !result.dry_run && result.entity_id > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onSelectEntity(result.entity_id)}
              >
                <span>Open Profile Ledger</span>
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>

          {result ? (
            <div>
              {/* Inline Editorial Metrics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '14px',
                  marginBottom: '16px',
                  gap: '16px',
                }}
              >
                <div>
                  <div className="mono" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {result.memories_extracted}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Claims Resolved
                  </div>
                </div>

                <div>
                  <div className="mono" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--teal)' }}>
                    {result.memories_new}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    New Records
                  </div>
                </div>

                <div>
                  <div className="mono" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ultramarine)' }}>
                    {result.memories_updated}
                  </div>
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Updated / Supported
                  </div>
                </div>
              </div>

              {/* Compiled State JSON Preview */}
              {result.state && Object.keys(result.state).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Compiled Deterministic State (intel.state)
                  </div>
                  <pre
                    className="intel-preview"
                    style={{ padding: '12px 14px', maxHeight: '140px', fontSize: '12px' }}
                  >
                    {JSON.stringify(result.state, null, 2)}
                  </pre>
                </div>
              )}

              {/* Extracted Claims List as Signal Strips */}
              <div className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Extracted Atomic Claims (Click to highlight span)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '440px', overflowY: 'auto' }}>
                {result.memories.map((mem, idx) => {
                  const ev = mem.evidence && mem.evidence[0];
                  const isSelected = activeClaimIdx === idx;
                  const stripClass =
                    mem.status === 'pending_review'
                      ? 'signal-strip-red'
                      : ev?.is_verified
                        ? 'signal-strip-teal'
                        : 'signal-strip-ultramarine';
                  return (
                    <div
                      key={mem.id || idx}
                      onClick={() => setActiveClaimIdx(idx)}
                      className={`signal-strip ${stripClass} ${isSelected ? 'selected' : ''}`}
                      style={{
                        background: isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {mem.topic_name ? (
                            <span className="tag-pill">
                              <Tag size={10} />
                              {mem.topic_name}
                            </span>
                          ) : (
                            <span className="badge badge-neutral">open_discovery</span>
                          )}
                          {mem.value && <span className="value-pill">= {mem.value}</span>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {ev?.is_verified ? (
                            <span className="badge badge-success">
                              <ShieldCheck size={11} />
                              [{ev.char_start}:{ev.char_end}]
                            </span>
                          ) : (
                            <span className="badge badge-warning">
                              <AlertTriangle size={11} />
                              Unverified
                            </span>
                          )}
                          <span className={`badge ${mem.status === 'pending_review' ? 'badge-warning' : 'badge-info'}`}>
                            {mem.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontWeight: 500, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {mem.claim}
                      </div>

                      {ev?.excerpt && (
                        <div className="mono" style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          &ldquo;{ev.excerpt}&rdquo;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '64px 20px' }}>
              <FlaskConical className="empty-state-icon" />
              <h4 className="empty-state-title">Ready to Simulate</h4>
              <p className="empty-state-text">
                Select a clinical or enterprise preset on the left—or paste your own text—and click &ldquo;Simulate Extraction&rdquo;.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
