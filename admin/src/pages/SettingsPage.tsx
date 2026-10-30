import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Key,
  BookOpen,
  Server,
  ShieldCheck,
} from 'lucide-react';
import type { HealthInfo } from '../types';

interface SettingsPageProps {
  health: HealthInfo | null;
  onRefreshHealth: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  health,
  onRefreshHealth,
}) => {
  const [apiKey, setApiKey] = useState(
    localStorage.getItem('cluestate_api_key') || ''
  );
  const [isSaved, setIsSaved] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<'python' | 'ts' | 'php' | 'curl'>('python');

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('cluestate_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('cluestate_api_key');
    }
    setIsSaved(true);
    onRefreshHealth();
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCopy = (snippet: string, id: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 1500);
  };

  const codeSnippets = {
    python: `# Ingest unstructured text into ClueState
import requests

api_url = "http://localhost:8000/api"
headers = {"Authorization": "Bearer YOUR_API_KEY"}  # if configured

# 1. Ingest an interaction & extract facts
res = requests.post(f"{api_url}/ingest", headers=headers, json={
    "external_id": "cust_123",
    "entity_name": "Alice Chen",
    "content": "Alice prefers Dark Mode and has a hard budget cap of $5,000/mo.",
    "source_type": "conversation"
})
print("Extracted claims:", res.json()["memories"])

# 2. Fetch formatted intelligence for LLM system prompt
intel = requests.get(f"{api_url}/intel/by-external-id/cust_123", headers=headers).json()
system_prompt = f"You are a helpful assistant.\\\\n\\\\n{intel['formatted_prompt']}"`,

    ts: `// Node.js / TypeScript Integration
const API_URL = 'http://localhost:8000/api';

// 1. Ingest unstructured dialogue
const ingestRes = await fetch(\`\${API_URL}/ingest\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    external_id: 'user_456',
    entity_name: 'Bob Miller',
    content: 'User mentioned they run PostgreSQL on AWS and prefer daily SMS summaries.',
    source_type: 'support_ticket',
  }),
});
const { memories } = await ingestRes.json();

// 2. Fetch formatted intelligence prompt
const intelRes = await fetch(\`\${API_URL}/intel/by-external-id/user_456\`);
const { formatted_prompt } = await intelRes.json();
console.log('LLM Prompt Intel:\\\\n', formatted_prompt);`,

    php: `<?php
// PHP cURL Integration
$apiUrl = 'http://localhost:8000/api';

// 1. Ingest interaction
$ch = curl_init("$apiUrl/ingest");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'external_id' => 'user_789',
    'entity_name' => 'Carla Diaz',
    'content' => 'Customer requested gluten-free catering and vegan snacks.',
    'source_type' => 'email'
]));
$response = json_decode(curl_exec($ch), true);
curl_close($ch);

// 2. Retrieve formatted intelligence
$intelJson = file_get_contents("$apiUrl/intel/by-external-id/user_789");
$intel = json_decode($intelJson, true);
$llmPromptBlock = $intel['formatted_prompt'];`,

    curl: `# 1. Ingest interaction & extract claims
curl -X POST http://localhost:8000/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "cust_101",
    "entity_name": "Devin Torres",
    "content": "Devin loves Kubernetes and needs SOC2 compliance.",
    "source_type": "conversation"
  }'

# 2. Get ready-to-use LLM system prompt block
curl http://localhost:8000/api/intel/by-external-id/cust_101`,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">API & Engine Settings</h1>
        <p className="page-subtitle">
          Integration code snippets, authentication, and engine runtime configuration.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        {/* Left Column: Code Integration Snippets */}
        <div>
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

        {/* Right Column: Engine Status & Auth */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* API Key Config */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={18} color="var(--warning)" />
              Dashboard API Key Auth
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              If your ClueState server is configured with an <code>API_KEY</code> or <code>CLUESTATE_API_KEY</code>, enter it below to authenticate dashboard requests.
            </p>

            <div className="input-group">
              <input
                type="password"
                className="input"
                placeholder="Bearer token (optional)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={handleSaveApiKey}>
              {isSaved ? (
                <>
                  <Check size={14} />
                  <span>Key Saved!</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Save API Key</span>
                </>
              )}
            </button>
          </div>

          {/* Engine Environment */}
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
