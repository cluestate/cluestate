import React, { useState, useRef, useEffect } from 'react';
import {
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
    { id: 'dashboard', label: 'Overview' },
    {
      id: 'review',
      label: 'Review Queue',
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { id: 'entities', label: 'Profiles' },
    { id: 'topics', label: 'Memory Schema' },
  ];

  const engineeringNav = [
    { id: 'playground', label: 'Extraction Bench' },
    { id: 'settings', label: 'Workspace & API' },
  ];

  const isHealthy = health?.status === 'ok';
  const versionStr = systemInfo?.version || health?.version || '0.1.1';
  const dbStr = (systemInfo?.database || health?.database || 'SQLite').toUpperCase();
  const modelStr = systemInfo?.llm_model || health?.llm_model || 'Configured LLM';

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <BrandMark size={26} />
          <div>
            <div className="sidebar-logo-text">ClueState</div>
            <div className="sidebar-logo-version">v{versionStr}</div>
          </div>
        </div>
      </div>

      {/* Borderless Workspace Selector */}
      {workspace && (
        <div
          ref={dropdownRef}
          style={{
            marginBottom: '18px',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            style={{
              width: '100%',
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
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
                width: '18px',
                height: '18px',
                background: 'var(--teal)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
              }}
            >
              {workspace.name ? workspace.name[0].toUpperCase() : 'W'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {workspace.name}
              </div>
            </div>
            <ChevronDown size={13} color="var(--text-muted)" />
          </button>

          {wsDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: '#FFFFFF',
                borderTop: '2px solid var(--ultramarine)',
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
                  letterSpacing: '0.08em',
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
                        background: isCurrent ? 'var(--bg-ice)' : 'transparent',
                        border: 'none',
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
                            fontWeight: isCurrent ? 700 : 500,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ws.name}
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {ws.role || 'member'}
                        </div>
                      </div>
                      {isCurrent && <Check size={13} color="var(--ultramarine)" />}
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
                      padding: '7px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--ultramarine)',
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

      {/* Navigation Links (Pure Typography + 6px Ultramarine Square Indicator) */}
      <div className="sidebar-nav">
        <div className="nav-section-label">Operations</div>
        {operationsNav.map((item) => {
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
              <span className="nav-pip" />
              <span>{item.label}</span>
              {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
            </button>
          );
        })}

        <div className="nav-section-label">Engineering</div>
        {engineeringNav.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="nav-pip" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm w-full"
            style={{ justifyContent: 'center' }}
            onClick={onOpenIngest}
          >
            <span>+ Ingest Record -&gt;</span>
          </button>
        </div>
      </div>

      {/* Footer / System Status & Account */}
      <div className="sidebar-footer">
        <div className="sidebar-health" style={{ marginBottom: '10px' }}>
          <div className={`health-dot ${isHealthy ? '' : 'offline'}`} />
          <div
            className="mono"
            style={{
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
            title={`${dbStr} · ${modelStr}`}
          >
            {dbStr} · {modelStr}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ overflow: 'hidden', flex: 1 }}>
            {user ? (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.full_name || user.email}
              </div>
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
