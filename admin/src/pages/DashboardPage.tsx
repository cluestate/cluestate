import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import type { DashboardStats, HealthInfo, MemoryStatus, Workspace } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface DashboardPageProps {
  workspace: Workspace | null;
  onSelectEntity: (entityId: number) => void;
  onOpenNewEntity: () => void;
  onOpenIngest: () => void;
  onNavigateTab: (tab: string) => void;
  health: HealthInfo | null;
  onStatsLoaded?: (stats: DashboardStats) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  workspace,
  onSelectEntity,
  onOpenNewEntity,
  onOpenIngest,
  onNavigateTab,
  onStatsLoaded,
}) => {
  const { notify } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getStats();
      setStats(data);
      if (onStatsLoaded) onStatsLoaded(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [workspace?.id]);

  const handleUpdateMemoryStatus = async (memoryId: number, status: MemoryStatus) => {
    try {
      await api.updateMemory(memoryId, { status });
      notify(`Claim #${memoryId} confirmed`, 'success');
      fetchStats();
    } catch (err: any) {
      notify(err.message || 'Failed to update memory', 'error');
    }
  };

  const pendingCount = stats?.pending_review_memories ?? stats?.status_counts?.pending_review ?? 0;
  const discoveryMode =
    stats?.extraction_policy?.discovery_mode ||
    workspace?.extraction_policy?.discovery_mode ||
    'guided';

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <span>{workspace?.name || 'WORKSPACE'}</span>
            <span>·</span>
            <span>
              POLICY:{' '}
              {discoveryMode === 'strict'
                ? 'STRICT SCHEMA ONLY'
                : discoveryMode === 'guided'
                  ? 'GUIDED HYBRID'
                  : 'OPEN DISCOVERY'}
            </span>
          </div>
          <h1 className="page-title">Overview</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchStats}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw size={13} />
            <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onOpenNewEntity}>
            <span>+ New Profile</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenIngest}>
            <span>+ Ingest Record -&gt;</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          className="signal-strip danger mb-6"
          style={{ background: 'var(--signal-red-bg)', color: 'var(--signal-red)' }}
        >
          {error}
        </div>
      )}

      {/* Inline Editorial Metrics (Zero Stat Boxes!) */}
      <div className="editorial-metrics">
        <div className="editorial-metric clickable" onClick={() => onNavigateTab('entities')}>
          <div className="editorial-metric-value">{stats ? stats.total_entities : '—'}</div>
          <div className="editorial-metric-label">Profiles Tracked</div>
        </div>

        <div className="editorial-metric clickable" onClick={() => onNavigateTab('review')}>
          <div className="editorial-metric-value">{stats ? stats.active_memories : '—'}</div>
          <div className="editorial-metric-label">Active State Facts</div>
        </div>

        <div className="editorial-metric clickable" onClick={() => onNavigateTab('review')}>
          <div
            className="editorial-metric-value"
            style={{ color: pendingCount > 0 ? 'var(--signal-red)' : undefined }}
          >
            {stats ? pendingCount : '—'}
          </div>
          <div className="editorial-metric-label">Needs Review</div>
        </div>

        <div className="editorial-metric">
          <div className="editorial-metric-value">{stats ? stats.total_episodes : '—'}</div>
          <div className="editorial-metric-label">Source Episodes</div>
        </div>

        <div className="editorial-metric clickable" onClick={() => onNavigateTab('topics')}>
          <div className="editorial-metric-value">{stats ? stats.total_topics : '—'}</div>
          <div className="editorial-metric-label">Schema Tags</div>
        </div>
      </div>

      {/* 3-Step Signal Strip Setup Guide when Workspace is empty */}
      {stats && (stats.total_topics === 0 || stats.total_memories === 0) && (
        <div style={{ marginBottom: '36px' }}>
          <div className="card-title">QUICKSTART SETUP</div>
          <div className="grid-3">
            <div
              className="signal-strip"
              style={{ background: 'var(--bg-ice)', cursor: 'pointer' }}
              onClick={() => onNavigateTab('topics')}
            >
              <div className="mono" style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--ultramarine)', marginBottom: '4px' }}>
                01 · MEMORY SCHEMA
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Define or Install Tags
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Install a Clinical Intake or SaaS pack, or create tags like <code>is_vegan</code> with custom instructions.
              </div>
            </div>

            <div
              className="signal-strip verified"
              style={{ background: 'var(--bg-ice)', cursor: 'pointer' }}
              onClick={() => onNavigateTab('playground')}
            >
              <div className="mono" style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--teal)', marginBottom: '4px' }}>
                02 · EXTRACTION BENCH
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Simulate in Dry Run
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Test extraction on a consultation note or transcript and inspect verified character spans.
              </div>
            </div>

            <div
              className="signal-strip"
              style={{ background: 'var(--bg-ice)', cursor: 'pointer' }}
              onClick={() => onNavigateTab('settings')}
            >
              <div className="mono" style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--ultramarine)', marginBottom: '4px' }}>
                03 · API &amp; TEAM
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Connect App or Invite Team
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Copy a scoped <code>cs_live_...</code> key or share a single-use invite link with colleagues.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2:1 Open Split: Signal Strips on Left + Cool Ice Context Plane on Right */}
      <div className="split-ledger">
        {/* Left 2/3: Recent State Extractions as 3px Signal Strips */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div className="card-title" style={{ margin: 0 }}>
              RECENT STATE EXTRACTIONS
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => onNavigateTab('review')}
            >
              <span>Open Full Queue</span>
              <ChevronRight size={12} />
            </button>
          </div>

          {stats?.recent_memories && stats.recent_memories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.recent_memories.map((mem) => {
                const isSafety =
                  mem.status === 'pending_review' ||
                  mem.status === 'rejected' ||
                  /(allergy|allergies|medical|restriction|condition|compliance)/.test(
                    (mem.topic_name || '').toLowerCase()
                  );
                const stripMod = isSafety
                  ? 'pending_review'
                  : mem.is_verified || mem.status === 'confirmed'
                    ? 'verified'
                    : '';

                return (
                  <div key={mem.id} className={`signal-strip ${stripMod}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '4px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => onSelectEntity(mem.entity_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {mem.entity_name}
                        </button>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span className="tag-pill">{mem.topic_name.replace(/_/g, ' ')}</span>
                        {mem.value && <span className="value-pill">= {mem.value}</span>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {mem.status === 'pending_review' ? (
                          <span className="badge badge-warning">SAFETY / REVIEW</span>
                        ) : mem.is_verified ? (
                          <span className="badge badge-success">
                            VERIFIED{mem.char_start != null ? ` [${mem.char_start}:${mem.char_end}]` : ''}
                          </span>
                        ) : (
                          <span className="badge badge-info">{mem.status}</span>
                        )}

                        {mem.status !== 'confirmed' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--teal)', padding: '2px 4px' }}
                            onClick={() => handleUpdateMemoryStatus(mem.id, 'confirmed')}
                            title="Confirm claim"
                          >
                            <CheckCircle2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {mem.claim}
                    </div>

                    {mem.excerpt && (
                      <div
                        className="mono"
                        style={{
                          marginTop: '6px',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        &ldquo;{mem.excerpt}&rdquo;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="surface-ice empty-state">
              <h4 className="empty-state-title">No State Facts Extracted Yet</h4>
              <p className="empty-state-text">
                Ingest a consultation note, dialogue transcript, or ticket to extract verified facts.
              </p>
              <button className="btn btn-primary btn-sm" onClick={onOpenIngest}>
                <span>+ Ingest First Record -&gt;</span>
              </button>
            </div>
          )}
        </div>

        {/* Right 1/3: Cool Ice Plane for Recent Profiles & Schema Coverage */}
        <div className="inspector-plane" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Recent Profiles */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span className="card-title" style={{ margin: 0 }}>
                RECENT PROFILES
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => onNavigateTab('entities')}
              >
                <span>Directory</span>
                <ChevronRight size={12} />
              </button>
            </div>

            {stats?.recent_entities && stats.recent_entities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.recent_entities.map((ent) => (
                  <div
                    key={ent.id}
                    onClick={() => onSelectEntity(ent.id)}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {ent.name}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {ent.external_id}
                      </div>
                    </div>
                    <span className="badge badge-info">{ent.entity_type}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                No profiles tracked yet.
              </div>
            )}
          </div>

          {/* Schema Tag Coverage */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span className="card-title" style={{ margin: 0 }}>
                COVERAGE BY TAG
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => onNavigateTab('topics')}
              >
                <span>Schema</span>
                <ChevronRight size={12} />
              </button>
            </div>

            {stats?.topic_distribution && stats.topic_distribution.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.topic_distribution.map((item) => {
                  const maxCount = Math.max(...stats.topic_distribution.map((t) => t.count), 1);
                  const percent = Math.round((item.count / maxCount) * 100);
                  return (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.name}
                        </span>
                        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                          {item.count}
                        </span>
                      </div>
                      <div style={{ height: '3px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: 'var(--ultramarine)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Define schema tags and ingest records to view coverage.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
