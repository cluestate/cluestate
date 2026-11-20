import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  UserPlus,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Plus,
  CheckCircle2,
  SlidersHorizontal,
  FlaskConical,
  KeyRound,
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
      notify(`Claim #${memoryId} marked as ${status}`, 'success');
      fetchStats();
    } catch (err: any) {
      notify(err.message || 'Failed to update memory', 'error');
    }
  };

  const getStatusBadge = (status: MemoryStatus) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge badge-success">CONFIRMED</span>;
      case 'active':
        return <span className="badge badge-info">ACTIVE</span>;
      case 'pending_review':
        return <span className="badge badge-warning">NEEDS REVIEW</span>;
      case 'rejected':
        return <span className="badge badge-danger">REJECTED</span>;
      case 'superseded':
        return <span className="badge badge-neutral">SUPERSEDED</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const pendingCount = stats?.pending_review_memories ?? stats?.status_counts?.pending_review ?? 0;
  const discoveryMode = stats?.extraction_policy?.discovery_mode || workspace?.extraction_policy?.discovery_mode || 'guided';

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <span>WORKSPACE LEDGER</span>
            <span>·</span>
            <span>{workspace?.name || 'Default Workspace'}</span>
            <span>·</span>
            <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
              Policy: {discoveryMode === 'strict' ? 'Strict Schema Only' : discoveryMode === 'guided' ? 'Guided Hybrid' : 'Open Discovery'}
            </span>
          </div>
          <h1 className="page-title">State &amp; Provenance Overview</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchStats}
            disabled={isLoading}
            title="Refresh ledger"
          >
            <RefreshCw size={13} />
            <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onOpenNewEntity}>
            <UserPlus size={13} />
            <span>New Profile</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenIngest}>
            <Plus size={13} />
            <span>Ingest Record</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* 3-Step Quickstart Banner when Workspace has 0 topics or 0 memories */}
      {stats && (stats.total_topics === 0 || stats.total_memories === 0) && (
        <div
          className="card mb-6"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-primary)',
            padding: '18px 22px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vermilion)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Workspace Setup Guide
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                Configure deterministic memory extraction in three steps
              </div>
            </div>
          </div>

          <div className="grid-3">
            <div
              onClick={() => onNavigateTab('topics')}
              style={{
                padding: '14px 16px',
                background: 'var(--bg-well)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  STEP 01
                </span>
                {stats.total_topics > 0 ? (
                  <span className="badge badge-success">{stats.total_topics} defined</span>
                ) : (
                  <SlidersHorizontal size={14} color="var(--text-secondary)" />
                )}
              </div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Define Memory Schema
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Install a Clinical Intake, SaaS, or Private Client bundle—or define custom tags like <code>is_vegan</code> with agent instructions.
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('playground')}
              style={{
                padding: '14px 16px',
                background: 'var(--bg-well)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  STEP 02
                </span>
                <FlaskConical size={14} color="var(--text-secondary)" />
              </div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Simulate in Extraction Bench
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Test extraction in Dry Run mode on a consultation transcript or customer note and verify exact character spans.
              </div>
            </div>

            <div
              onClick={() => onNavigateTab('settings')}
              style={{
                padding: '14px 16px',
                background: 'var(--bg-well)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  STEP 03
                </span>
                <KeyRound size={14} color="var(--text-secondary)" />
              </div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Connect API Key or Team
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Copy a scoped <code>cs_live_...</code> key for your app or generate a single-use invite link for colleagues.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single-Row Hairline Metric Strip */}
      <div className="metric-strip">
        <div className="metric-cell clickable" onClick={() => onNavigateTab('entities')}>
          <div className="metric-label">
            <span>Tracked Profiles</span>
            <ArrowRight size={12} />
          </div>
          <div className="metric-value">{stats ? stats.total_entities : '—'}</div>
          <div className="metric-meta">Patients, Clients, Orgs</div>
        </div>

        <div className="metric-cell clickable" onClick={() => onNavigateTab('review')}>
          <div className="metric-label">
            <span>Active State Facts</span>
            <ArrowRight size={12} />
          </div>
          <div className="metric-value">{stats ? stats.active_memories : '—'}</div>
          <div className="metric-meta">
            {stats ? `${stats.total_memories} total recorded` : 'Loading…'}
          </div>
        </div>

        <div className="metric-cell clickable" onClick={() => onNavigateTab('review')}>
          <div className="metric-label">
            <span>Needs Review</span>
            <ArrowRight size={12} />
          </div>
          <div
            className="metric-value"
            style={{ color: pendingCount > 0 ? 'var(--vermilion)' : 'var(--text-primary)' }}
          >
            {stats ? pendingCount : '—'}
          </div>
          <div className="metric-meta">Quarantined or sensitive</div>
        </div>

        <div className="metric-cell">
          <div className="metric-label">
            <span>Source Episodes</span>
          </div>
          <div className="metric-value">{stats ? stats.total_episodes : '—'}</div>
          <div className="metric-meta">Notes, calls, intakes</div>
        </div>

        <div className="metric-cell clickable" onClick={() => onNavigateTab('topics')}>
          <div className="metric-label">
            <span>Defined Schema Tags</span>
            <ArrowRight size={12} />
          </div>
          <div className="metric-value">{stats ? stats.total_topics : '—'}</div>
          <div className="metric-meta">Enforced contracts</div>
        </div>
      </div>

      {/* 2:1 Split Ledger */}
      <div className="split-ledger">
        {/* Left 2/3: Recent Extracted State Ledger */}
        <div className="table-container">
          <div className="table-header">
            <div>
              <h3 className="table-header-title">Recent State Extractions</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Atomic claims with typed coercion and source provenance verification
              </span>
            </div>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => onNavigateTab('review')}
            >
              <span>Open Full Ledger</span>
              <ChevronRight size={12} />
            </button>
          </div>

          {stats?.recent_memories && stats.recent_memories.length > 0 ? (
            <div>
              {stats.recent_memories.map((mem) => (
                <div
                  key={mem.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => onSelectEntity(mem.entity_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          fontFamily: 'inherit',
                        }}
                      >
                        {mem.entity_name}
                      </button>

                      <span className="tag-pill">#{mem.topic_name}</span>

                      {mem.value && (
                        <span className="value-pill">= {mem.value}</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {mem.is_verified ? (
                        <span className="badge badge-success">
                          <ShieldCheck size={11} />
                          Verified{mem.char_start != null ? ` [${mem.char_start}:${mem.char_end}]` : ''}
                        </span>
                      ) : (
                        <span className="badge badge-neutral">
                          <AlertTriangle size={11} />
                          Unverified
                        </span>
                      )}
                      {getStatusBadge(mem.status)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                      {mem.claim}
                    </div>

                    {mem.status !== 'confirmed' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--success)', flexShrink: 0 }}
                        onClick={() => handleUpdateMemoryStatus(mem.id, 'confirmed')}
                      >
                        <CheckCircle2 size={12} />
                        <span>Confirm</span>
                      </button>
                    )}
                  </div>

                  {mem.excerpt && (
                    <div
                      className="mono"
                      style={{
                        marginTop: '6px',
                        fontSize: '11.5px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Quote: &ldquo;{mem.excerpt}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h4 className="empty-state-title">No State Records Extracted Yet</h4>
              <p className="empty-state-text">
                Ingest a clinical note, customer dialogue, or transcript to populate verified facts.
              </p>
              <button className="btn btn-primary btn-sm" onClick={onOpenIngest}>
                <Plus size={14} />
                <span>Ingest First Record</span>
              </button>
            </div>
          )}
        </div>

        {/* Right 1/3: Recent Profiles & Schema Coverage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Recent Entities */}
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-header-title">Recent Profiles</h3>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => onNavigateTab('entities')}
              >
                <span>View All</span>
                <ChevronRight size={12} />
              </button>
            </div>

            {stats?.recent_entities && stats.recent_entities.length > 0 ? (
              <div>
                {stats.recent_entities.map((ent) => (
                  <div
                    key={ent.id}
                    onClick={() => onSelectEntity(ent.id)}
                    style={{
                      padding: '11px 18px',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ent.name}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {ent.external_id}
                      </div>
                    </div>
                    <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                      {ent.entity_type}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No profiles created yet.
              </div>
            )}
          </div>

          {/* Schema Distribution */}
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-header-title">State Coverage by Tag</h3>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => onNavigateTab('topics')}
              >
                <span>Configure Schema</span>
                <ChevronRight size={12} />
              </button>
            </div>

            <div style={{ padding: '14px 18px' }}>
              {stats?.topic_distribution && stats.topic_distribution.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stats.topic_distribution.map((item) => {
                    const maxCount = Math.max(...stats.topic_distribution.map((t) => t.count), 1);
                    const percent = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                          <span className="mono" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            #{item.name}
                          </span>
                          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                            {item.count}
                          </span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-well)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: 'var(--text-primary)',
                              borderRadius: '2px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px', padding: '12px 0' }}>
                  Define memory tags and ingest records to track schema coverage.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
