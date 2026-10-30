import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Loader2,
  Brain,
  ExternalLink,
  Bot,
  Zap,
} from 'lucide-react';
import type { Entity, IngestResponse, SourceType } from '../types';
import { api } from '../api';
import { ConfidenceBar } from '../components/ConfidenceBar';

const PLAYGROUND_PRESETS = [
  {
    title: 'SaaS Sales Discovery',
    entityName: 'Sarah Jenkins',
    externalId: 'contact_sarah_j',
    sourceType: 'conversation' as SourceType,
    sourceDesc: 'Introductory Discovery Call',
    content: `Sales Rep: Hi Sarah, great connecting today! Can you tell me a bit about your current data pipeline?
Sarah: Sure! Right now our team is heavily reliant on Snowflake and dbt, but we're experiencing major latency issues during peak hours. Our primary stack is Python and FastAPI on AWS ECS.
Sales Rep: Got it. What is your timeline for upgrading?
Sarah: We have a hard deadline to migrate by end of Q4 before our renewal. Our total tooling budget for this project is around $60,000 annually.
Sales Rep: Who else will be involved in the technical sign-off?
Sarah: Myself and our VP of Engineering, David Vance.`,
  },
  {
    title: 'Customer Support Escalation',
    entityName: 'Liam Miller',
    externalId: 'cust_liam_882',
    sourceType: 'support_ticket' as SourceType,
    sourceDesc: 'Priority Support Ticket #4419',
    content: `Customer Ticket:
"I am frustrated with the latest mobile release. The biometric face login fails every time on my iPhone 15 Pro Max running iOS 18. I travel weekly for consulting and need offline mode access. Please make sure notifications are sent strictly via SMS since I rarely check email while on flights."`,
  },
  {
    title: 'Hospitality & VIP Guest Profile',
    entityName: 'Elena Rostova',
    externalId: 'guest_elena_r',
    sourceType: 'review' as SourceType,
    sourceDesc: 'Concierge Booking Notes & Preferences',
    content: `Concierge Notes:
Guest Elena Rostova requested a high-floor corner suite away from elevator shafts for her upcoming anniversary stay on November 15th. Severe peanut and tree nut allergy — kitchen must be notified. She prefers oat milk for morning espresso and asked for extra hypoallergenic down-free pillows.`,
  },
];

interface PlaygroundPageProps {
  onSelectEntity: (entityId: number) => void;
}

export const PlaygroundPage: React.FC<PlaygroundPageProps> = ({
  onSelectEntity,
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [externalId, setExternalId] = useState('demo_customer_01');
  const [entityName, setEntityName] = useState('Demo Customer');
  const [sourceType, setSourceType] = useState<SourceType>('conversation');
  const [sourceDescription, setSourceDescription] = useState('Interactive Lab Test');
  const [content, setContent] = useState(PLAYGROUND_PRESETS[0].content);

  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    try {
      const data = await api.listEntities('', 100);
      setEntities(data);
    } catch {
      // Ignore
    }
  };

  const applyPreset = (preset: typeof PLAYGROUND_PRESETS[0]) => {
    setSelectedEntityId('');
    setEntityName(preset.entityName);
    setExternalId(preset.externalId);
    setSourceType(preset.sourceType);
    setSourceDescription(preset.sourceDesc);
    setContent(preset.content);
    setResult(null);
    setError(null);
  };

  const handleRunExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    try {
      setIsExtracting(true);
      setError(null);

      const payload: any = {
        content: content.trim(),
        source_type: sourceType,
        source_description: sourceDescription.trim() || undefined,
      };

      if (selectedEntityId) {
        payload.entity_id = Number(selectedEntityId);
      } else {
        payload.external_id = externalId.trim() || 'entity_' + Date.now();
        payload.entity_name = entityName.trim() || payload.external_id;
        payload.auto_create_entity = true;
      }

      const res = await api.ingest(payload);
      setResult(res);
      await loadEntities();
    } catch (err: any) {
      setError(err.message || 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Extraction Lab & Playground</h1>
        <p className="page-subtitle">
          Test real-time extraction of structured facts, entity resolution, and confidence scoring on live text.
        </p>
      </div>

      {/* Preset Selector */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} color="var(--warning)" /> Load Demo Scenario:
        </span>
        {PLAYGROUND_PRESETS.map((preset) => (
          <button
            key={preset.title}
            className="btn btn-secondary btn-sm"
            onClick={() => applyPreset(preset)}
          >
            {preset.title}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* 2-Column Playground Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr', gap: '24px' }}>
        {/* Left Column: Input Form */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} color="var(--accent-primary)" />
            Input Dialogue / Unstructured Source
          </h3>

          <form onSubmit={handleRunExtraction}>
            <div className="input-group">
              <label className="input-label">Target Entity</label>
              <select
                className="input"
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              >
                <option value="">-- Use Custom External ID below --</option>
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
                    className="input"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Entity Name</label>
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
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                >
                  <option value="conversation">Conversation</option>
                  <option value="email">Email</option>
                  <option value="support_ticket">Support Ticket</option>
                  <option value="call_transcript">Call Transcript</option>
                  <option value="review">Review</option>
                  <option value="note">Note</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Source Context</label>
                <input
                  type="text"
                  className="input"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                  placeholder="e.g. Call transcript"
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Content to Analyze</label>
              <textarea
                className="input"
                style={{ minHeight: '220px', fontSize: '13px', lineHeight: 1.6 }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste any conversation or unstructured text here..."
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', height: '44px' }}
              disabled={isExtracting || !content.trim()}
            >
              {isExtracting ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  <span>Extracting Claims with LLM...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Extract & Resolve Memories</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Live Extraction Results */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={18} color="var(--success)" />
              Extracted Knowledge Graph
            </h3>

            {result && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onSelectEntity(result.entity_id)}
              >
                <span>View Full Profile</span>
                <ExternalLink size={13} />
              </button>
            )}
          </div>

          {result ? (
            <div>
              {/* Summary Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>
                    {result.memories_extracted}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Claims Extracted</div>
                </div>

                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-primary-hover)' }}>
                    {result.memories_new}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>New Memories</div>
                </div>

                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)' }}>
                    {result.memories_updated}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated / Confirmed</div>
                </div>
              </div>

              {/* Memory Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto' }}>
                {result.memories.map((mem) => (
                  <div
                    key={mem.id}
                    style={{
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', flex: 1, paddingRight: '10px' }}>
                        {mem.claim}
                      </div>
                      <ConfidenceBar confidence={mem.confidence} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-success" style={{ fontSize: '11px' }}>
                        {mem.status}
                      </span>
                      {mem.topic_name && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--accent-primary-hover)',
                            background: 'rgba(99, 102, 241, 0.1)',
                            padding: '2px 8px',
                            borderRadius: '100px',
                          }}
                        >
                          #{mem.topic_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '80px 20px' }}>
              <Sparkles className="empty-state-icon" />
              <h4 className="empty-state-title">Ready for Extraction</h4>
              <p className="empty-state-text">
                Select a scenario preset on the left or paste your own interaction, then click "Extract & Resolve Memories".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
