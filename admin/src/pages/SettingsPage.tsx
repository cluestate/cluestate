import React, { useState, useEffect } from 'react';
import {
  Code2,
  Copy,
  Check,
  Key,
  BookOpen,
  Server,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ApiKeyItem, HealthInfo } from '../types';
import { api } from '../api';

interface SettingsPageProps {
  health: HealthInfo | null;
  onRefreshHealth: () => void;
  initialNewKey?: string | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  health,
  initialNewKey,
}) => {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(initialNewKey || null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<'python' | 'ts' | 'php' | 'curl'>('python');

  const fetchApiKeys = async () => {
    try {
      const keys = await api.listApiKeys();
      setApiKeys(keys);
    } catch {
      // Ignore if authenticated via static master key without DB keys
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      setIsCreatingKey(true);
      const created = await api.createApiKey(newKeyName.trim());
      setNewlyCreatedKey(created.raw_key);
      setNewKeyName('');
      await fetchApiKeys();
    } catch (err: any) {
      alert(err.message || 'Failed to create API key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    if (!confirm('Revoke this API key? Applications using it will immediately lose access.')) return;
    try {
      await api.revokeApiKey(keyId);
      await fetchApiKeys();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke API key');
    }
  };

  const handleCopy = (snippet: string, id: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 1500);
  };

  const handleCopyNewKey = () => {
    if (!newlyCreatedKey) return;
    navigator.clipboard.writeText(newlyCreatedKey);
    setCopiedNewKey(true);
    setTimeout(() => setCopiedNewKey(false), 2000);
  };

  const serverUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://app.cluestate.com';
  const baseUrl = `${serverUrl}/api`;

  const codeSnippets = {
    python: `# ClueState Python SDK (Sync & Async)
from cluestate import ClueState

cs = ClueState(
    api_key="cs_live_YOUR_API_KEY",
    base_url="${serverUrl}",
)

# 1. Ingest an interaction & extract verified claims
res = cs.ingest(
    external_id="cust_123",
    entity_name="Alice Chen",
    content="Alice prefers Dark Mode and confirmed an annual budget of $50,000.",
    source_type="conversation",
    idempotency_key="evt_2026_10_31_001",
)
for m in res.memories:
    print(f"[{m.topic_name}] {m.claim} (value={m.structured_value})")

# 2. Retrieve structured customer state
intel = cs.get_intel("cust_123")
print(intel.formatted_prompt)`,

    ts: `// ClueState TypeScript / JavaScript SDK (@cluestate/sdk)
import { ClueState } from '@cluestate/sdk';

const cs = new ClueState({
  apiKey: 'cs_live_YOUR_API_KEY',
  baseUrl: '${serverUrl}',
});

// 1. Ingest interaction
const res = await cs.ingest({
  externalId: 'user_456',
  entityName: 'Bob Miller',
  content: 'Customer runs PostgreSQL on AWS and requested weekly email reports.',
  sourceType: 'support_ticket',
  idempotencyKey: 'evt_ticket_456',
});
console.log('Extracted claims:', res.memories);

// 2. Fetch structured customer state
const intel = await cs.getIntel('user_456');
console.log(intel.formatted_prompt);`,

    php: `<?php
// PHP cURL Integration
$apiUrl = '${baseUrl}';
$headers = [
    'Content-Type: application/json',
    'Authorization: Bearer cs_live_YOUR_API_KEY',
];

// 1. Ingest interaction
$ch = curl_init("$apiUrl/ingest");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'external_id' => 'user_789',
    'entity_name' => 'Carla Diaz',
    'content' => 'Customer prefers Salomon trail-running shoes in size EU 39.',
    'source_type' => 'purchase'
]));
$response = json_decode(curl_exec($ch), true);
curl_close($ch);`,

    curl: `# 1. Ingest interaction & extract verified claims
curl -X POST ${baseUrl}/ingest \\
  -H "Authorization: Bearer cs_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "cust_101",
    "entity_name": "Devin Torres",
    "content": "Devin migrated from AWS to GCP in October and requires SOC2 compliance.",
    "source_type": "conversation"
  }'

# 2. Retrieve structured customer state
curl ${baseUrl}/intel/by-external-id/cust_101 \\
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"`,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">API Keys & Integration</h1>
        <p className="page-subtitle">
          Manage workspace API keys, inspect runtime specifications, and copy integration snippets.
        </p>
      </div>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <div
          className="card mb-6"
          style={{
            borderColor: 'var(--success)',
            background: 'rgba(16, 185, 129, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--success)', marginBottom: '4px' }}>
                Save your new API Key now
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                For security reasons, this full secret key will only be shown once:
              </div>
              <code
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {newlyCreatedKey}
              </code>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" onClick={handleCopyNewKey}>
                {copiedNewKey ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedNewKey ? 'Copied!' : 'Copy Secret Key'}</span>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setNewlyCreatedKey(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '24px' }}>
        {/* Left Column: Workspace API Keys & Snippets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Workspace API Keys */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Key size={18} color="var(--accent-primary)" />
              Workspace API Keys
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Use scoped API keys in the <code>Authorization: Bearer cs_live_...</code> header when calling ClueState from your backend or MCP client.
            </p>

            <form
              onSubmit={handleCreateKey}
              style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}
            >
              <input
                type="text"
                className="input"
                placeholder="Key name (e.g. Production Backend, CRM Webhook)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isCreatingKey}
                style={{ flexShrink: 0 }}
              >
                <Plus size={15} />
                <span>{isCreatingKey ? 'Creating...' : 'Create Key'}</span>
              </button>
            </form>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key Prefix</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{k.name}</td>
                      <td>
                        <code style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {k.key_prefix}...
                        </code>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(k.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleRevokeKey(k.id)}
                          title="Revoke key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                        No workspace API keys found. Create one above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Code Snippets */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code2 size={18} color="var(--accent-primary)" />
                Client Integration Snippets
              </h3>

              <div style={{ display: 'flex', gap: '6px' }}>
                {(['python', 'ts', 'php', 'curl'] as const).map((lang) => (
                  <button
                    key={lang}
                    className={`btn btn-sm ${selectedLang === lang ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedLang(lang)}
                    style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}
                  >
                    {lang === 'ts' ? 'TypeScript' : lang}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: 'var(--bg-primary)',
                  padding: '20px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--text-accent)',
                  overflowX: 'auto',
                }}
              >
                {codeSnippets[selectedLang]}
              </pre>

              <button
                className="btn btn-secondary btn-sm"
                style={{ position: 'absolute', top: '12px', right: '12px' }}
                onClick={() => handleCopy(codeSnippets[selectedLang], selectedLang)}
              >
                {copiedSnippet === selectedLang ? (
                  <>
                    <Check size={13} color="var(--success)" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Engine Specifications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={18} color="var(--success)" />
              Engine Specifications
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span className="badge badge-success">Online & Ready</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Engine Version</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {health?.version ? `v${health.version}` : 'v0.1.0'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>LLM Provider & Model</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary-hover)' }}>
                  {health?.llm_model || 'openai/gpt-4o-mini'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Storage Engine</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                  {health?.database || 'SQLite'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary w-full"
                style={{ justifyContent: 'center' }}
              >
                <BookOpen size={15} />
                <span>Open Interactive OpenAPI / Swagger Docs</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
