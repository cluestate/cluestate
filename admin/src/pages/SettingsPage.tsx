import React, { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  Check,
  Key,
  BookOpen,
  Server,
  Plus,
  Trash2,
  Layers,
  Users,
  Link2,
  Building2,
} from 'lucide-react';
import type {
  ApiKeyItem,
  HealthInfo,
  SystemInfo,
  User,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface SettingsPageProps {
  health: HealthInfo | null;
  systemInfo?: SystemInfo | null;
  user: User | null;
  workspace: Workspace | null;
  onRefreshHealth: () => void;
  onWorkspaceUpdated?: (ws: Workspace) => void;
  onOpenNewWorkspace?: () => void;
  initialNewKey?: string | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  health,
  systemInfo,
  user,
  workspace,
  onWorkspaceUpdated,
  onOpenNewWorkspace,
  initialNewKey,
}) => {
  const { notify, confirmAction } = useToast();
  const [activeTab, setActiveTab] = useState<'team' | 'apikeys' | 'runtime'>(
    initialNewKey ? 'apikeys' : 'team'
  );

  // Workspace rename
  const [wsName, setWsName] = useState(workspace?.name || '');
  const [isSavingWs, setIsSavingWs] = useState(false);

  // Members & Invites
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(initialNewKey || null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<'python' | 'ts' | 'curl' | 'mcp'>('python');

  // Source Types
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [defaultSourceTypes, setDefaultSourceTypes] = useState<string[]>([]);
  const [newSourceTypeName, setNewSourceTypeName] = useState('');
  const [isAddingSourceType, setIsAddingSourceType] = useState(false);

  const serverUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'http://localhost:8000';
  const baseUrl = `${serverUrl}/api`;

  useEffect(() => {
    if (workspace?.name) setWsName(workspace.name);
  }, [workspace?.name]);

  const fetchAll = useCallback(async () => {
    try {
      const keys = await api.listApiKeys();
      setApiKeys(keys);
    } catch {
      // Ignore if API key session
    }

    try {
      const st = await api.getSourceTypes();
      setSourceTypes(st.source_types || []);
      setDefaultSourceTypes(st.defaults || []);
    } catch {
      // Ignore
    }

    if (workspace?.id && user) {
      try {
        const [memList, invList] = await Promise.all([
          api.listWorkspaceMembers(workspace.id),
          api.listWorkspaceInvites(workspace.id),
        ]);
        setMembers(memList);
        setInvites(invList);
      } catch {
        // Ignore if viewer
      }
    }
  }, [workspace?.id, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRenameWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !wsName.trim()) return;
    try {
      setIsSavingWs(true);
      const updated = await api.updateWorkspace(workspace.id, { name: wsName.trim() });
      notify('Workspace name updated', 'success');
      if (onWorkspaceUpdated) onWorkspaceUpdated(updated);
    } catch (err: any) {
      notify(err.message || 'Failed to rename workspace', 'error');
    } finally {
      setIsSavingWs(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    try {
      setIsCreatingInvite(true);
      const created = await api.createWorkspaceInvite(workspace.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
        expires_in_days: 7,
      });
      const link = `${serverUrl}/?invite=${created.token}`;
      setLatestInviteLink(link);
      setInviteEmail('');
      notify('Generated single-use workspace invite link', 'success');
      fetchAll();
    } catch (err: any) {
      notify(err.message || 'Failed to create invite link', 'error');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = (token: string) => {
    const link = `${serverUrl}/?invite=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedInviteId(token);
    notify('Invite link copied to clipboard', 'info');
    setTimeout(() => setCopiedInviteId(null), 1800);
  };

  const handleRevokeInvite = async (inviteId: number) => {
    if (!workspace) return;
    try {
      await api.revokeWorkspaceInvite(workspace.id, inviteId);
      notify('Invite link revoked', 'info');
      fetchAll();
    } catch (err: any) {
      notify(err.message || 'Failed to revoke invite', 'error');
    }
  };

  const handleUpdateMemberRole = async (memberId: number, role: WorkspaceRole) => {
    if (!workspace) return;
    try {
      await api.updateWorkspaceMemberRole(workspace.id, memberId, role);
      notify('Updated member role', 'success');
      fetchAll();
    } catch (err: any) {
      notify(err.message || 'Failed to update role', 'error');
    }
  };

  const handleRemoveMember = (mem: WorkspaceMember) => {
    if (!workspace) return;
    confirmAction({
      title: `Remove ${mem.full_name || mem.email} from ${workspace.name}?`,
      description: 'They will immediately lose access to this workspace.',
      confirmLabel: 'Remove Member',
      danger: true,
      onConfirm: async () => {
        try {
          await api.removeWorkspaceMember(workspace.id, mem.id);
          notify(`Removed ${mem.email}`, 'info');
          fetchAll();
        } catch (err: any) {
          notify(err.message || 'Failed to remove member', 'error');
        }
      },
    });
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      setIsCreatingKey(true);
      const created = await api.createApiKey(newKeyName.trim());
      setNewlyCreatedKey(created.raw_key);
      setNewKeyName('');
      notify(`Created API key "${created.name}"`, 'success');
      await fetchAll();
    } catch (err: any) {
      notify(err.message || 'Failed to create API key', 'error');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = (key: ApiKeyItem) => {
    confirmAction({
      title: `Revoke API Key "${key.name}" (${key.key_prefix}…)?`,
      description: 'Any applications or agents authenticating with this key will immediately receive 401 Unauthorized.',
      confirmLabel: 'Revoke Key',
      danger: true,
      onConfirm: async () => {
        try {
          await api.revokeApiKey(key.id);
          notify(`Revoked API key "${key.name}"`, 'info');
          await fetchAll();
        } catch (err: any) {
          notify(err.message || 'Failed to revoke key', 'error');
        }
      },
    });
  };

  const handleAddSourceType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTypeName.trim()) return;
    try {
      setIsAddingSourceType(true);
      const res = await api.addSourceType(newSourceTypeName.trim());
      setSourceTypes(res.source_types || []);
      setNewSourceTypeName('');
      notify('Registered provenance source category', 'success');
    } catch (err: any) {
      notify(err.message || 'Failed to add source type', 'error');
    } finally {
      setIsAddingSourceType(false);
    }
  };

  const handleDeleteSourceType = async (name: string) => {
    try {
      const res = await api.deleteSourceType(name);
      setSourceTypes(res.source_types || []);
      notify(`Removed source type '${name}'`, 'info');
    } catch (err: any) {
      notify(err.message || 'Failed to remove source type', 'error');
    }
  };

  const handleCopy = (snippet: string, id: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(id);
    notify('Snippet copied to clipboard', 'info');
    setTimeout(() => setCopiedSnippet(null), 1500);
  };

  const handleCopyNewKey = () => {
    if (!newlyCreatedKey) return;
    navigator.clipboard.writeText(newlyCreatedKey);
    setCopiedNewKey(true);
    notify('API key copied to clipboard', 'success');
    setTimeout(() => setCopiedNewKey(false), 2000);
  };

  const displayKey = newlyCreatedKey || 'cs_live_YOUR_WORKSPACE_API_KEY';

  const codeSnippets = {
    python: `from cluestate import ClueState

# Connect to "${workspace?.name || 'Workspace'}" (1 key = 1 isolated workspace)
cs = ClueState(
    api_key="${displayKey}",
    base_url="${serverUrl}",
)

# 1. Ingest interaction or clinical/customer note
res = cs.ingest(
    external_id="patient_402",
    entity_name="Clara Lindqvist",
    source_type="clinical_note",
    content="Patient is strictly vegan and has a documented penicillin allergy.",
)

# 2. Access compiled deterministic state + LLM prompt block
intel = cs.get_intel("patient_402")
print(intel.state)            # {'is_vegan': True, 'known_allergies': ['penicillin']}
print(intel.formatted_prompt)`,

    ts: `import { ClueState } from '@cluestate/sdk';

const cs = new ClueState({
  apiKey: '${displayKey}',
  baseUrl: '${serverUrl}',
});

await cs.ingest({
  externalId: 'patient_402',
  entityName: 'Clara Lindqvist',
  sourceType: 'clinical_note',
  content: 'Patient is strictly vegan and has a documented penicillin allergy.',
});

const intel = await cs.getIntel('patient_402');
console.log(intel.state);            // { is_vegan: true, known_allergies: ['penicillin'] }
console.log(intel.formatted_prompt);`,

    curl: `# 1. Ingest interaction into "${workspace?.name || 'Workspace'}"
curl -X POST ${baseUrl}/ingest \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "patient_402",
    "entity_name": "Clara Lindqvist",
    "source_type": "clinical_note",
    "content": "Patient is strictly vegan and has a documented penicillin allergy."
  }'

# 2. Retrieve compiled deterministic state & prompt block
curl ${baseUrl}/intel/by-external-id/patient_402 \\
  -H "Authorization: Bearer ${displayKey}"`,

    mcp: `{
  "mcpServers": {
    "cluestate": {
      "command": "cluestate",
      "args": ["mcp"],
      "env": {
        "CLUESTATE_API_URL": "${serverUrl}",
        "CLUESTATE_API_KEY": "${displayKey}"
      }
    }
  }
}`,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">WORKSPACE ADMINISTRATION &amp; DEVELOPER ACCESS</div>
          <h1 className="page-title">Workspace, Team &amp; API Integration</h1>
          <p className="page-subtitle">
            Manage workspace members, zero-SMTP invite links, scoped <code>cs_live_</code> API keys, and provenance categories.
          </p>
        </div>

        {user && onOpenNewWorkspace && (
          <button className="btn btn-secondary btn-sm" onClick={onOpenNewWorkspace}>
            <Building2 size={14} />
            <span>+ New Workspace</span>
          </button>
        )}
      </div>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <div
          className="card mb-6"
          style={{
            borderColor: 'var(--success-border)',
            background: 'var(--success-bg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--success)', marginBottom: '2px' }}>
                Scoped Workspace API Key Minted — Copy Now
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                This secret key grants access to <strong>{workspace?.name}</strong> and is shown only once:
              </div>
              <code
                className="mono"
                style={{
                  display: 'inline-block',
                  padding: '6px 10px',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--text-primary)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                }}
              >
                {newlyCreatedKey}
              </code>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" onClick={handleCopyNewKey}>
                {copiedNewKey ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedNewKey ? 'Copied' : 'Copy Secret Key'}</span>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setNewlyCreatedKey(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          <Users size={14} />
          <span>Team &amp; Workspace ({members.length || 1})</span>
        </button>

        <button
          type="button"
          className={`tab ${activeTab === 'apikeys' ? 'active' : ''}`}
          onClick={() => setActiveTab('apikeys')}
        >
          <Key size={14} />
          <span>API Keys &amp; Quickstart ({apiKeys.length})</span>
        </button>

        <button
          type="button"
          className={`tab ${activeTab === 'runtime' ? 'active' : ''}`}
          onClick={() => setActiveTab('runtime')}
        >
          <Server size={14} />
          <span>Provenance &amp; Engine</span>
        </button>
      </div>

      {/* TAB 1: WORKSPACE & TEAM MEMBERS */}
      {activeTab === 'team' && (
        <div className="split-ledger">
          {/* Left 2/3: Members Table & Pending Invites */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Team Members Table */}
            <div className="table-container">
              <div className="table-header">
                <div>
                  <h3 className="table-header-title">Workspace Members ({members.length})</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Operators, clinicians, and developers with access to {workspace?.name}
                  </span>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {m.full_name || m.email.split('@')[0]}
                        {user?.id === m.user_id && (
                          <span className="badge badge-neutral" style={{ marginLeft: '6px' }}>
                            You
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: '12px' }}>
                        {m.email}
                      </td>
                      <td>
                        {m.role === 'owner' ? (
                          <span className="badge badge-info">OWNER</span>
                        ) : (
                          <select
                            className="input"
                            style={{ width: '115px', padding: '3px 24px 3px 8px', fontSize: '12px' }}
                            value={m.role}
                            onChange={(e) =>
                              handleUpdateMemberRole(m.id, e.target.value as WorkspaceRole)
                            }
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {m.role !== 'owner' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRemoveMember(m)}
                            title="Remove member"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        Authenticated via API key. Sign in with a user session to manage team members.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pending Invites */}
            {invites.length > 0 && (
              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-header-title">Active Invitation Links ({invites.length})</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Restricted Email</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th style={{ textAlign: 'right' }}>Invite Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id}>
                        <td className="mono" style={{ fontSize: '12px' }}>
                          {inv.email || <span style={{ color: 'var(--text-muted)' }}>Anyone with link</span>}
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                            {inv.role}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => handleCopyInviteLink(inv.token)}
                            >
                              {copiedInviteId === inv.token ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedInviteId === inv.token ? 'Copied' : 'Copy Link'}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleRevokeInvite(inv.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right 1/3: Invite Generator & Workspace Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="card">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Link2 size={14} />
                <span>Invite Teammate (Zero-SMTP Link)</span>
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.45 }}>
                Generate a single-use invitation URL. No email server configuration required—share the link directly with your colleague.
              </p>

              <form onSubmit={handleCreateInvite}>
                <div className="input-group">
                  <label className="input-label">Restrict to Email (Optional)</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="colleague@clinic.org (or leave blank)"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Workspace Role</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                  >
                    <option value="admin">Admin — Manage schema, API keys &amp; members</option>
                    <option value="member">Member — Review claims, ingest &amp; edit profiles</option>
                    <option value="viewer">Viewer — Read-only access to profiles &amp; state</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm w-full"
                  style={{ justifyContent: 'center' }}
                  disabled={isCreatingInvite || !user}
                >
                  <Plus size={14} />
                  <span>{isCreatingInvite ? 'Generating…' : 'Generate Invite Link'}</span>
                </button>
              </form>

              {latestInviteLink && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '10px 12px',
                    background: 'var(--success-bg)',
                    border: '1px solid var(--success-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--success)', marginBottom: '4px' }}>
                    Shareable Invite URL (Valid 7 days):
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      className="input mono"
                      style={{ fontSize: '11.5px', padding: '5px 8px' }}
                      value={latestInviteLink}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(latestInviteLink);
                        notify('Invite link copied', 'success');
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {workspace && user && (
              <div className="card">
                <h3 className="card-title">Workspace Identity</h3>
                <form onSubmit={handleRenameWorkspace}>
                  <div className="input-group">
                    <label className="input-label">Workspace Name</label>
                    <input
                      type="text"
                      className="input"
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Workspace Slug</label>
                    <input type="text" className="input mono" value={workspace.slug} disabled />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-secondary btn-sm"
                    disabled={isSavingWs || wsName.trim() === workspace.name}
                  >
                    {isSavingWs ? 'Saving…' : 'Update Name'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: API KEYS & QUICKSTART */}
      {activeTab === 'apikeys' && (
        <div className="split-ledger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Scoped API Keys */}
            <div className="card">
              <h3 className="card-title">Scoped Workspace API Keys ({workspace?.name})</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Each API key is bound strictly to <strong>{workspace?.name}</strong>. Pass it via{' '}
                <code>Authorization: Bearer cs_live_...</code> — no extra workspace header needed.
              </p>

              <form
                onSubmit={handleCreateKey}
                style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}
              >
                <input
                  type="text"
                  className="input"
                  placeholder="Key label (e.g. Clinic EHR Webhook, Production Backend)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isCreatingKey}
                >
                  <Plus size={14} />
                  <span>{isCreatingKey ? 'Minting…' : 'Mint API Key'}</span>
                </button>
              </form>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Key Name</th>
                      <th>Prefix</th>
                      <th>Last Used</th>
                      <th>Created</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</td>
                        <td>
                          <code className="tag-pill">{k.key_prefix}…</code>
                        </td>
                        <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {k.last_used_at
                            ? new Date(k.last_used_at).toLocaleString()
                            : 'Never used'}
                        </td>
                        <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {new Date(k.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRevokeKey(k)}
                            title="Revoke key"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {apiKeys.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                          No active API keys in this workspace. Mint one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Integration Snippets */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="card-title" style={{ margin: 0 }}>
                  Quickstart Integration Snippets
                </h3>

                <div className="segmented-control">
                  {(
                    [
                      { id: 'python', label: 'Python SDK' },
                      { id: 'ts', label: 'TypeScript SDK' },
                      { id: 'curl', label: 'cURL' },
                      { id: 'mcp', label: 'MCP Server' },
                    ] as const
                  ).map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      className={`segmented-option ${selectedLang === lang.id ? 'active' : ''}`}
                      onClick={() => setSelectedLang(lang.id)}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <pre className="intel-preview" style={{ fontSize: '12px' }}>
                  {codeSnippets[selectedLang]}
                </pre>

                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  style={{ position: 'absolute', top: '10px', right: '10px' }}
                  onClick={() => handleCopy(codeSnippets[selectedLang], selectedLang)}
                >
                  {copiedSnippet === selectedLang ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSnippet === selectedLang ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">How Connection Works</h3>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: 1.5 }}>
              <div>
                <strong>1. One Key = One Workspace</strong>
                <p style={{ marginTop: '2px' }}>
                  Every <code>cs_live_...</code> key is cryptographically bound to this workspace. Your application only needs <code>CLUESTATE_API_KEY</code> and <code>CLUESTATE_API_URL</code>.
                </p>
              </div>
              <div>
                <strong>2. Deterministic State + Prompt</strong>
                <p style={{ marginTop: '2px' }}>
                  Calling <code>get_intel(external_id)</code> returns both <code>intel.state</code> (a typed JSON dictionary of your defined Memory Tags) and <code>intel.formatted_prompt</code>.
                </p>
              </div>
              <div>
                <strong>3. Privilege Isolation</strong>
                <p style={{ marginTop: '2px' }}>
                  Data-plane API keys cannot create or revoke other API keys or modify workspace members.
                </p>
              </div>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm w-full"
                style={{ justifyContent: 'center', marginTop: '6px' }}
              >
                <BookOpen size={13} />
                <span>Open OpenAPI / Swagger Reference</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROVENANCE & RUNTIME */}
      {activeTab === 'runtime' && (
        <div className="grid-2">
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} />
              <span>Workspace Provenance Categories</span>
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Source types classify where episodes originate (e.g. <code>clinical_note</code>, <code>intake_form</code>, <code>conversation</code>). Any new category sent via the API is auto-registered.
            </p>

            <form onSubmit={handleAddSourceType} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                type="text"
                className="input mono"
                placeholder="e.g. clinical_note, lab_report"
                value={newSourceTypeName}
                onChange={(e) => setNewSourceTypeName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={isAddingSourceType}>
                <Plus size={13} />
                <span>Add</span>
              </button>
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {sourceTypes.map((st) => {
                const isDefault = defaultSourceTypes.includes(st);
                return (
                  <span key={st} className="tag-pill" style={{ padding: '4px 9px' }}>
                    <span>{st}</span>
                    {isDefault ? (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(core)</span>
                    ) : (
                      <button
                        type="button"
                        className="chip-remove"
                        onClick={() => handleDeleteSourceType(st)}
                        title={`Remove ${st}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Authenticated Runtime Telemetry</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Engine Status</span>
                <span className="badge badge-success">ONLINE</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Engine Version</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  v{systemInfo?.version || health?.version || '0.1.1'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Configured LLM Provider</span>
                <span className="tag-pill">{systemInfo?.llm_model || 'openai/gpt-4o-mini'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Relational Storage Backend</span>
                <span className="mono" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  {systemInfo?.database || 'SQLite'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
