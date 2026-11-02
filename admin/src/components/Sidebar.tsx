import React from 'react';
import {
  Brain,
  LayoutDashboard,
  Users,
  Tags,
  Sparkles,
  Code2,
  PlusCircle,
  Activity,
  LogOut,
  Building2,
} from 'lucide-react';
import type { HealthInfo, User, Workspace } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  health: HealthInfo | null;
  user: User | null;
  workspace: Workspace | null;
  onOpenIngest: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  health,
  user,
  workspace,
  onOpenIngest,
  onLogout,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'entities', label: 'Entities', icon: Users },
    { id: 'topics', label: 'State Schemas', icon: Tags },
    { id: 'playground', label: 'Extraction Lab', icon: Sparkles },
    { id: 'settings', label: 'API & Settings', icon: Code2 },
  ];

  const isHealthy = health?.status === 'ok';

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Brain size={22} color="#fff" />
          </div>
          <div>
            <div className="sidebar-logo-text">ClueState</div>
            <div className="sidebar-logo-version">
              {health?.version ? `v${health.version}` : 'v0.1.0'} &bull; Ready
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Badge */}
      {workspace && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 12px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Building2 size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {workspace.name}
            </div>
            {user && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </div>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onLogout}
            title="Sign out"
            style={{ padding: '4px', color: 'var(--text-muted)' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      )}

      {/* Quick Action Button */}
      <div style={{ padding: '14px 16px 4px' }}>
        <button
          className="btn btn-primary w-full"
          style={{ justifyContent: 'center', height: '40px' }}
          onClick={onOpenIngest}
        >
          <PlusCircle size={16} />
          <span>Quick Ingest</span>
        </button>
      </div>

      {/* Navigation Links */}
      <div className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="nav-item-icon">
                <Icon size={18} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer / System Status */}
      <div className="sidebar-footer">
        <div className="sidebar-health">
          <div className={`health-dot ${isHealthy ? '' : 'offline'}`} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isHealthy ? 'Engine Connected' : 'Engine Offline'}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {health
                ? `${(health.database || 'engine').toUpperCase()} • ${health.llm_model || 'active'}`
                : 'Connecting...'}
            </div>
          </div>
          <Activity size={15} color="var(--text-muted)" />
        </div>
      </div>
    </aside>
  );
};
