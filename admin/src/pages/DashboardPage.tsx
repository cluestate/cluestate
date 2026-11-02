import React, { useEffect, useState } from 'react';
import {
  Brain,
  Users,
  FileText,
  Tags,
  Sparkles,
  ArrowRight,
  UserPlus,
  RefreshCw,
  ChevronRight,
  Database,
  Cpu,
} from 'lucide-react';
import type { DashboardStats, HealthInfo, MemoryStatus } from '../types';
import { api } from '../api';
import { ConfidenceBar } from '../components/ConfidenceBar';

interface DashboardPageProps {
  onSelectEntity: (entityId: number) => void;
  onOpenNewEntity: () => void;
  onOpenIngest: () => void;
  onNavigateTab: (tab: string) => void;
  health: HealthInfo | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onSelectEntity,
  onOpenNewEntity,
  onOpenIngest,
  onNavigateTab,
  health,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleUpdateMemoryStatus = async (memoryId: number, status: MemoryStatus) => {
    try {
      await api.updateMemory(memoryId, { status });
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'Failed to update memory');
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Intelligence Overview</h1>
          <p className="page-subtitle">
            Continuous memory extraction, cross-session facts, and real-time knowledge graphs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={fetchStats} title="Refresh">
            <RefreshCw size={15} className={isLoading ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-secondary" onClick={onOpenNewEntity}>
            <UserPlus size={15} />
            <span>New Entity</span>
          </button>
          <button className="btn btn-primary" onClick={onOpenIngest}>
            <Sparkles size={15} />
            <span>Ingest Knowledge</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--danger-bg)',
            border: '1px solid rgba(248, 113, 113, 0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            marginBottom: '24px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => onNavigateTab('entities')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Tracked Entities</span>
            <div className="stat-card-icon">
              <Users size={20} color="var(--accent-primary)" />
            </div>
          </div>
          <div className="stat-card-value">{stats ? stats.total_entities : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Users, Orgs, Patients, Products</span>
            <ArrowRight size={12} />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Active Memories</span>
            <div className="stat-card-icon">
              <Brain size={20} color="var(--success)" />
            </div>
          </div>
          <div className="stat-card-value">{stats ? stats.active_memories : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {stats ? `${stats.total_memories} total facts recorded` : 'Loading facts...'}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Episodes Ingested</span>
            <div className="stat-card-icon">
              <FileText size={20} color="var(--info)" />
            </div>
          </div>
          <div className="stat-card-value">{stats ? stats.total_episodes : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Chats, emails, transcripts, notes
          </div>
        </div>

        <div className="stat-card" onClick={() => onNavigateTab('topics')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-card-label">Topic Schemas</span>
            <div className="stat-card-icon">
              <Tags size={20} color="var(--accent-secondary)" />
            </div>
          </div>
          <div className="stat-card-value">{stats ? stats.total_topics : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Categories for extraction</span>
            <ArrowRight size={12} />
          </div>
        </div>
      </div>

      {/* Main Content 2-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', marginTop: '24px' }}>
        {/* Left Column: Recent Extracted Memories */}
        <div>
          <div className="table-container">
            <div className="table-header">
              <div>
                <h3 className="table-header-title">Recent Knowledge Extractions</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Atomic claims extracted by LLM from interactions
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={onOpenIngest}
                style={{ fontSize: '12px' }}
              >
                <Sparkles size={13} />
                <span>Test Live Ingest</span>
              </button>
            </div>

            {stats?.recent_memories && stats.recent_memories.length > 0 ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.recent_memories.map((mem) => (
                  <div
                    key={mem.id}
                    style={{
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      transition: 'border-color 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--accent-primary-hover)',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={() => onSelectEntity(mem.entity_id)}
                        >
                          {mem.entity_name}
                        </span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>&bull;</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          #{mem.topic_name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ConfidenceBar confidence={mem.confidence} />
                      </div>
                    </div>

                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.5 }}>
                      {mem.claim}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span className="badge badge-success" style={{ fontSize: '11px' }}>
                        {mem.status}
                      </span>

                      {mem.status !== 'confirmed' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '11px', color: 'var(--success)', padding: '2px 8px' }}
                          onClick={() => handleUpdateMemoryStatus(mem.id, 'confirmed')}
                        >
                          Confirm Claim
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Brain className="empty-state-icon" />
                <h4 className="empty-state-title">No Memories Yet</h4>
                <p className="empty-state-text">
                  Ingest conversations, emails, or notes to see atomic facts extracted automatically.
                </p>
                <button className="btn btn-primary" onClick={onOpenIngest}>
                  <Sparkles size={15} />
                  <span>Ingest Sample Dialogue</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent Entities & Topic Distribution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recent Entities */}
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-header-title">Recent Entities</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onNavigateTab('entities')}
                style={{ fontSize: '12px' }}
              >
                <span>View All</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {stats?.recent_entities && stats.recent_entities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.recent_entities.map((ent) => (
                  <div
                    key={ent.id}
                    onClick={() => onSelectEntity(ent.id)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'background var(--transition)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ent.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        ID: {ent.external_id}
                      </div>
                    </div>
                    <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                      {ent.entity_type}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No entities tracked yet.
              </div>
            )}
          </div>

          {/* Topic Distribution */}
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-header-title">Knowledge by Topic</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onNavigateTab('topics')}
                style={{ fontSize: '12px' }}
              >
                <span>Manage</span>
                <ChevronRight size={13} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {stats?.topic_distribution && stats.topic_distribution.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {stats.topic_distribution.map((item) => {
                    const maxCount = Math.max(...stats.topic_distribution.map((t) => t.count), 1);
                    const percent = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            #{item.name}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {item.count} fact{item.count === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: 'var(--accent-gradient)',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px 0' }}>
                  Ingest text to see knowledge topic distribution.
                </div>
              )}
            </div>
          </div>

          {/* System Environment */}
          <div className="table-container" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
              Engine Status
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} color="var(--accent-primary)" />
                  LLM Model
                </span>
                <span className="badge badge-info">{health?.llm_model || 'openai/gpt-4o-mini'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={14} color="var(--success)" />
                  Database
                </span>
                <span className="badge badge-success">{health?.database ? health.database.toUpperCase() : 'CONNECTED'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
