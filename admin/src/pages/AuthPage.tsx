import React, { useState, useEffect } from 'react';
import { Lock, Mail, User as UserIcon, Building2, Key, ArrowRight, ShieldCheck } from 'lucide-react';
import { api, TOKEN_STORAGE_KEY, API_KEY_STORAGE_KEY, WORKSPACE_ID_STORAGE_KEY } from '../api';
import type { InviteInspectInfo, User, Workspace } from '../types';
import { BrandMark } from '../components/BrandMark';

interface AuthPageProps {
  inviteToken?: string | null;
  onAuthenticated: (
    user: User | null,
    workspace: Workspace | null,
    workspaces?: Workspace[],
    initialApiKey?: string | null
  ) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ inviteToken, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'apikey' | 'invite'>(
    inviteToken ? 'invite' : 'login'
  );
  const [inviteInfo, setInviteInfo] = useState<InviteInspectInfo | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [directApiKey, setDirectApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (inviteToken) {
      setMode('invite');
      api
        .inspectInvite(inviteToken)
        .then((info) => {
          setInviteInfo(info);
          if (info.email) setEmail(info.email);
        })
        .catch((err) => {
          setError(err.message || 'Invalid or expired invite link');
        });
    }
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'invite' && inviteToken) {
        const res = await api.acceptInvite(inviteToken, {
          email: email.trim(),
          full_name: fullName.trim(),
          password,
        });
        localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
        localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(res.workspace.id));
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onAuthenticated(res.user, res.workspace, res.workspaces || [res.workspace], null);
        return;
      }

      if (mode === 'apikey') {
        const trimmed = directApiKey.trim();
        if (!trimmed) {
          setError('Please enter your API key');
          setIsLoading(false);
          return;
        }
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        const ws = await api.getCurrentWorkspace();
        onAuthenticated(null, ws, [ws], null);
        return;
      }

      if (mode === 'signup') {
        const res = await api.signup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          workspace_name: workspaceName.trim(),
        });
        localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
        localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(res.workspace.id));
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onAuthenticated(
          res.user,
          res.workspace,
          res.workspaces || [res.workspace],
          res.initial_api_key
        );
      } else {
        const res = await api.login({
          email: email.trim(),
          password,
        });
        localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
        localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, String(res.workspace.id));
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onAuthenticated(res.user, res.workspace, res.workspaces || [res.workspace], null);
      }
    } catch (err: any) {
      if (mode === 'apikey') {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-canvas)',
        padding: '24px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '30px 32px',
          border: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '22px',
            paddingBottom: '18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <BrandMark size={34} />
          <div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              ClueState
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Deterministic Entity State &amp; Evidence Ledger
            </div>
          </div>
        </div>

        {mode === 'invite' && inviteInfo ? (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '18px',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} />
              <span>Workspace Invitation</span>
            </div>
            <div style={{ marginTop: '4px' }}>
              You have been invited to join <strong>{inviteInfo.workspace_name}</strong> as{' '}
              <code className="mono">{inviteInfo.role}</code>.
            </div>
          </div>
        ) : (
          <div
            className="segmented-control w-full"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              className={`segmented-option ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`segmented-option ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
            >
              New Workspace
            </button>
            <button
              type="button"
              className={`segmented-option ${mode === 'apikey' ? 'active' : ''}`}
              onClick={() => {
                setMode('apikey');
                setError(null);
              }}
            >
              API Key
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: '12.5px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'apikey' ? (
            <div className="input-group">
              <label className="input-label">Scoped Workspace API Key</label>
              <div style={{ position: 'relative' }}>
                <Key
                  size={14}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '11px', top: '11px' }}
                />
                <input
                  type="password"
                  className="input mono"
                  style={{ paddingLeft: '32px' }}
                  placeholder="cs_live_..."
                  value={directApiKey}
                  onChange={(e) => setDirectApiKey(e.target.value)}
                  required
                />
              </div>
              <span className="input-hint">
                Inspect workspace entities, schema tags, and memories directly with a data-plane key.
              </span>
            </div>
          ) : (
            <>
              {(mode === 'signup' || mode === 'invite') && (
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserIcon
                      size={14}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '11px', top: '11px' }}
                    />
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: '32px' }}
                      placeholder="Dr. Elena Vance"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={mode === 'signup'}
                    />
                  </div>
                </div>
              )}

              {mode === 'signup' && (
                <div className="input-group">
                  <label className="input-label">Organization / Clinic / Workspace Name</label>
                  <div style={{ position: 'relative' }}>
                    <Building2
                      size={14}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '11px', top: '11px' }}
                    />
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: '32px' }}
                      placeholder="Zurich Health Clinic or Acme Production"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={14}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '11px', top: '11px' }}
                  />
                  <input
                    type="email"
                    className="input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="you@organization.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={Boolean(mode === 'invite' && inviteInfo?.email)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">
                  Password{' '}
                  {(mode === 'signup' || mode === 'invite') && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(min. 8 characters)</span>
                  )}
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={14}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '11px', top: '11px' }}
                  />
                  <input
                    type="password"
                    className="input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="••••••••"
                    minLength={mode === 'login' ? 1 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div className="input-group">
                  <label className="input-label">Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock
                      size={14}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '11px', top: '11px' }}
                    />
                    <input
                      type="password"
                      className="input"
                      style={{ paddingLeft: '32px' }}
                      placeholder="••••••••"
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', height: '38px', marginTop: '6px' }}
            disabled={isLoading}
          >
            <span>
              {isLoading
                ? 'Authenticating…'
                : mode === 'invite'
                  ? 'Accept Invitation & Join Workspace'
                  : mode === 'signup'
                    ? 'Initialize Workspace'
                    : mode === 'apikey'
                      ? 'Connect with API Key'
                      : 'Sign In to Workspace'}
            </span>
            <ArrowRight size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};
