import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  ClipboardCheck,
  Users,
  SlidersHorizontal,
  FlaskConical,
  KeyRound,
  Plus,
  LogOut,
  ChevronDown,
  Check,
  Building2,
} from 'lucide-react';
import type { HealthInfo, SystemInfo, User, Workspace } from '../types';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  health: HealthInfo | null;
  systemInfo?: SystemInfo | null;
  pendingReviewCount?: number;
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  onSwitchWorkspace: (ws: Workspace) => void;
  onOpenNewWorkspace: () => void;
  onOpenIngest: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  health,
  systemInfo,
  pendingReviewCount = 0,
  user,
  workspace,
  workspaces,
  onSwitchWorkspace,
  onOpenNewWorkspace,
  onOpenIngest,
  onLogout,
}) => {
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const operationsNav = [
    { id: 'dashboard', label: 'Overview', icon: LayoutGrid },
    {
      id: 'review',
      label: 'Review Queue',
      icon: ClipboardCheck,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { id: 'entities', label: 'Profiles & Entities', icon: Users },
    { id: 'topics', label: 'Memory Schema', icon: SlidersHorizontal },
  ];

  const engineeringNav = [
    { id: 'playground', label: 'Extraction Bench', icon: FlaskConical },
    { id: 'settings', label: 'Workspace & API', icon: KeyRound },
  ];

  const isHealthy = health?.status === 'ok';
  const versionStr = systemInfo?.version || health?.version || '0.1.1';
  const dbStr = (systemInfo?.database || health?.database || 'SQLite').toUpperCase();
  const modelStr = systemInfo?.llm_model || health?.llm_model || 'Configured LLM';

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sidebar-logo">
            <BrandMark size={28} />
            <div>
              <div className="sidebar-logo-text">ClueState</div>
              <div className="sidebar-logo-version">v{versionStr} · Ledger</div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onOpenIngest}
            title="Ingest new interaction or record"
          >
            <Plus size={12} />
            <span>Ingest</span>
          </button>
        </div>
      </div>

      {/* Workspace Switcher */}
      {workspace && (
        <div
          ref={dropdownRef}
          style={{
            padding: '10px 10px 4px',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '4px',
                background: 'var(--text-primary)',
                color: '#FAFAF8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
              }}
            >
              {workspace.name ? workspace.name[0].toUpperCase() : 'W'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {workspace.name}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {workspace.role || 'owner'} · {workspace.slug}
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-muted)" />
          </button>

          {wsDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '10px',
                right: '10px',
                marginTop: '4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 100,
                padding: '6px',
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  padding: '4px 8px',
                  letterSpacing: '0.06em',
                }}
              >
                Workspaces ({workspaces.length || 1})
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', margin: '2px 0' }}>
                {(workspaces.length > 0 ? workspaces : [workspace]).map((ws) => {
                  const isCurrent = ws.id === workspace.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => {
                        setWsDropdownOpen(false);
                        if (!isCurrent) onSwitchWorkspace(ws);
                      }}
                      style={{
                        width: '100%',
                        background: isCurrent ? 'var(--bg-well)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-xs)',
                        padding: '7px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <div
                          style={{
                            fontSize: '12.5px',
                            fontWeight: isCurrent ? 600 : 500,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ws.name}
                        </div>
                        <div className="mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          {ws.role || 'member'}
                        </div>
                      </div>
                      {isCurrent && <Check size={13} color="var(--text-primary)" />}
                    </button>
                  );
                })}
              </div>

              {user && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '4px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setWsDropdownOpen(false);
                      onOpenNewWorkspace();
                    }}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      padding: '7px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Building2 size={13} />
                    <span>+ New Workspace</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation Links */}
      <div className="sidebar-nav">
        <div className="nav-section-label">Operations</div>
        {operationsNav.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentTab === item.id ||
            (item.id === 'entities' && currentTab === 'entity_detail');
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="nav-item-icon">
                <Icon size={16} strokeWidth={1.85} />
              </span>
              <span>{item.label}</span>
              {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
            </button>
          );
        })}

        <div className="nav-section-label">Engineering</div>
        {engineeringNav.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="nav-item-icon">
                <Icon size={16} strokeWidth={1.85} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer / System Status & Account */}
      <div className="sidebar-footer">
        <div className="sidebar-health" style={{ marginBottom: user ? '10px' : 0 }}>
          <div className={`health-dot ${isHealthy ? '' : 'offline'}`} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              className="mono"
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              title={`${dbStr} · ${modelStr}`}
            >
              {dbStr} · {modelStr}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: user ? '8px' : 0,
            borderTop: user ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <div style={{ overflow: 'hidden', flex: 1 }}>
            {user ? (
              <>
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
                  {user.full_name || user.email}
                </div>
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
              </>
            ) : (
              <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                API Key Session
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onLogout}
            title="Sign out"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
};
