import React, { useState } from 'react';
import { Brain, Lock, Mail, User as UserIcon, Building2, Key, ArrowRight } from 'lucide-react';
import { api, TOKEN_STORAGE_KEY, API_KEY_STORAGE_KEY } from '../api';
import type { User, Workspace } from '../types';

interface AuthPageProps {
  onAuthenticated: (user: User | null, workspace: Workspace | null, initialApiKey?: string | null) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'apikey'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [directApiKey, setDirectApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'apikey') {
        const trimmed = directApiKey.trim();
        if (!trimmed) {
          setError('Please enter your API key');
          setIsLoading(false);
          return;
        }
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        // Verify key works by fetching stats
        await api.getStats();
        onAuthenticated(null, { id: 1, name: 'API Key Session', slug: 'api-key', created_at: new Date().toISOString() });
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
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onAuthenticated(res.user, res.workspace, res.initial_api_key);
      } else {
        const res = await api.login({
          email: email.trim(),
          password,
        });
        localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onAuthenticated(res.user, res.workspace, null);
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
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        padding: '24px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '32px',
          border: '1px solid var(--border-primary)',
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Brain size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              ClueState
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Customer Intelligence Infrastructure
            </div>
          </div>
        </div>

        {/* Mode Switcher */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '4px',
            background: 'var(--bg-secondary)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '24px',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'center' }}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'signup' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'center' }}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'apikey' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ justifyContent: 'center' }}
            onClick={() => {
              setMode('apikey');
              setError(null);
            }}
          >
            API Key
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'apikey' ? (
            <div className="input-group">
              <label className="input-label">Workspace or Master API Key</label>
              <div style={{ position: 'relative' }}>
                <Key
                  size={15}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '12px', top: '12px' }}
                />
                <input
                  type="password"
                  className="input"
                  style={{ paddingLeft: '36px' }}
                  placeholder="cs_live_..."
                  value={directApiKey}
                  onChange={(e) => setDirectApiKey(e.target.value)}
                  required
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                Authenticate directly using a workspace key or your server&apos;s configured API_KEY.
              </span>
            </div>
          ) : (
            <>
              {mode === 'signup' && (
                <>
                  <div className="input-group">
                    <label className="input-label">Full Name</label>
                    <div style={{ position: 'relative' }}>
                      <UserIcon
                        size={15}
                        color="var(--text-muted)"
                        style={{ position: 'absolute', left: '12px', top: '12px' }}
                      />
                      <input
                        type="text"
                        className="input"
                        style={{ paddingLeft: '36px' }}
                        placeholder="Elena Vance"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Company / Workspace Name</label>
                    <div style={{ position: 'relative' }}>
                      <Building2
                        size={15}
                        color="var(--text-muted)"
                        style={{ position: 'absolute', left: '12px', top: '12px' }}
                      />
                      <input
                        type="text"
                        className="input"
                        style={{ paddingLeft: '36px' }}
                        placeholder="Acme Corp"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="input-group">
                <label className="input-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={15}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '12px', top: '12px' }}
                  />
                  <input
                    type="email"
                    className="input"
                    style={{ paddingLeft: '36px' }}
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">
                  Password {mode === 'signup' && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(min. 8 chars)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={15}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '12px', top: '12px' }}
                  />
                  <input
                    type="password"
                    className="input"
                    style={{ paddingLeft: '36px' }}
                    placeholder="••••••••"
                    minLength={mode === 'signup' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div className="input-group">
                  <label className="input-label">Repeat Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock
                      size={15}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '12px', top: '12px' }}
                    />
                    <input
                      type="password"
                      className="input"
                      style={{ paddingLeft: '36px' }}
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
            style={{ justifyContent: 'center', height: '42px', marginTop: '8px' }}
            disabled={isLoading}
          >
            <span>
              {isLoading
                ? 'Authenticating...'
                : mode === 'signup'
                  ? 'Create Workspace'
                  : mode === 'apikey'
                    ? 'Connect with API Key'
                    : 'Sign In'}
            </span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};

