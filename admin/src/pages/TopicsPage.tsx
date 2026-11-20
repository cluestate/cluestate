import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle,
  Layers,
  SlidersHorizontal,
  ShieldAlert,
  Save,
} from 'lucide-react';
import type {
  DiscoveryMode,
  ExtractionPolicy,
  JudgeMode,
  Topic,
  TopicCardinality,
  TopicConstraints,
  UpdatePolicy,
  Workspace,
} from '../types';
import { api } from '../api';
import { TopicModal } from '../components/TopicModal';
import { useToast } from '../components/Toast';

interface BundleTopicDef {
  name: string;
  label: string;
  description: string;
  extraction_instructions: string;
  data_type: string;
  cardinality: TopicCardinality;
  update_policy: UpdatePolicy;
  enum_values?: string[];
  allow_custom_values?: boolean;
  allow_inferred?: boolean;
  constraints?: TopicConstraints;
  applies_to_entity_types?: string[];
}

const PRESET_BUNDLES: {
  id: string;
  category: string;
  title: string;
  description: string;
  topics: BundleTopicDef[];
}[] = [
  {
    id: 'clinical',
    category: 'HEALTHCARE & CLINICS',
    title: 'Clinical Patient Intake & Safety',
    description:
      'Track drug/food allergies, dietary protocols (e.g. vegan), chronic conditions, active medications, and communication preferences with clinical safety guardrails.',
    topics: [
      {
        name: 'known_allergies',
        label: 'Known Allergies',
        description: 'Documented drug, food, or environmental allergies and adverse reactions.',
        extraction_instructions:
          'Extract only explicitly reported allergies or sensitivities (e.g. Penicillin, Peanuts, Latex). Never infer an allergy from dietary preference alone.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'review',
        enum_values: ['penicillin', 'peanuts', 'tree_nuts', 'latex', 'shellfish', 'nsaid', 'sulfa', 'dairy'],
        allow_custom_values: true,
        allow_inferred: false,
        applies_to_entity_types: ['person'],
      },
      {
        name: 'is_vegan',
        label: 'Vegan Diet',
        description: 'Whether the patient or client follows a strictly plant-based vegan diet.',
        extraction_instructions:
          'Set to true ONLY if the person explicitly states they follow a vegan or 100% plant-based diet. Do NOT infer true from ordering one plant-based meal or being vegetarian. Set to false if they report consuming meat, fish, dairy, or eggs.',
        data_type: 'boolean',
        cardinality: 'single',
        update_policy: 'replace',
        allow_inferred: false,
        applies_to_entity_types: ['person'],
      },
      {
        name: 'dietary_restrictions',
        label: 'Dietary Restrictions',
        description: 'Ongoing dietary protocols or intolerances relevant to care and nutrition.',
        extraction_instructions:
          'Capture stated dietary restrictions such as gluten_free, lactose_intolerant, low_sodium, kosher, halal, or ketogenic.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
        enum_values: ['gluten_free', 'lactose_intolerant', 'low_sodium', 'vegetarian', 'halal', 'kosher', 'keto'],
        allow_custom_values: true,
        applies_to_entity_types: ['person'],
      },
      {
        name: 'chronic_conditions',
        label: 'Chronic Conditions',
        description: 'Ongoing medical diagnoses or conditions managed by the patient.',
        extraction_instructions:
          'Extract explicitly confirmed medical diagnoses or chronic conditions. Ignore hypothetical or ruled-out conditions.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'review',
        allow_inferred: false,
        applies_to_entity_types: ['person'],
      },
      {
        name: 'preferred_contact_method',
        label: 'Preferred Contact Method',
        description: 'Preferred channel for appointment reminders and follow-ups.',
        extraction_instructions: 'Extract the patient preferred contact method when stated.',
        data_type: 'enum',
        cardinality: 'single',
        update_policy: 'replace',
        enum_values: ['sms', 'phone_call', 'email', 'patient_portal', 'whatsapp'],
        allow_custom_values: true,
      },
    ],
  },
  {
    id: 'saas',
    category: 'B2B & REVENUE',
    title: 'Enterprise SaaS & Account Intelligence',
    description:
      'Maintain deterministic account state across discovery calls: approved budget, infrastructure stack, blockers, executive sponsor, and renewal dates.',
    topics: [
      {
        name: 'annual_budget',
        label: 'Annual Budget (USD)',
        description: 'Approved annual software or project spend target.',
        extraction_instructions:
          'Extract concrete stated budget amounts. Ignore hypothetical pricing questions.',
        data_type: 'number',
        cardinality: 'single',
        update_policy: 'replace',
        constraints: { unit: 'USD', min: 0 },
      },
      {
        name: 'tech_stack',
        label: 'Technology Stack',
        description: 'Databases, cloud providers, languages, and core tools actively used.',
        extraction_instructions:
          'Record technologies currently in use. When migrating away from a tool, supersede the old tool.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'pain_points',
        label: 'Operational Pain Points',
        description: 'Key workflow bottlenecks and technical challenges mentioned.',
        extraction_instructions: 'Extract specific operational or technical friction points.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'decision_maker',
        label: 'Decision Maker',
        description: 'Primary executive sponsor or final sign-off authority.',
        extraction_instructions: 'Identify the named person or role responsible for final approval.',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'renewal_date',
        label: 'Renewal / Target Date',
        description: 'Contract renewal date or go-live deadline (YYYY-MM-DD).',
        extraction_instructions: 'Normalize explicit contract renewal or migration dates to YYYY-MM-DD.',
        data_type: 'date',
        cardinality: 'single',
        update_policy: 'replace',
      },
    ],
  },
  {
    id: 'concierge',
    category: 'HOSPITALITY & PRIVATE CLIENT',
    title: 'VIP Client & Concierge Preferences',
    description:
      'Track suite preferences, beverage & dining notes, brand affinities, and milestone dates across visits.',
    topics: [
      {
        name: 'brand_preferences',
        label: 'Brand Affinities',
        description: 'Preferred brands, product lines, and equipment.',
        extraction_instructions: 'Extract brands or product lines the client actively prefers or purchases.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'accommodation_preferences',
        label: 'Accommodation & Room Notes',
        description: 'Floor level, pillow type, quiet room, or check-in requirements.',
        extraction_instructions: 'Extract durable accommodation or travel preferences.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'price_tier',
        label: 'Spend Orientation',
        description: 'Client price tier orientation.',
        extraction_instructions: 'Classify client spend tier when explicitly indicated.',
        data_type: 'enum',
        cardinality: 'single',
        update_policy: 'replace',
        enum_values: ['value', 'mid_tier', 'premium', 'ultra_luxury'],
        allow_custom_values: false,
      },
    ],
  },
];

interface TopicsPageProps {
  workspace: Workspace | null;
  onWorkspaceUpdated?: (ws: Workspace) => void;
}

export const TopicsPage: React.FC<TopicsPageProps> = ({
  workspace,
  onWorkspaceUpdated,
}) => {
  const { notify, confirmAction } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [seedingBundle, setSeedingBundle] = useState<string | null>(null);

  // Workspace Extraction & Discovery Policy state
  const [policy, setPolicy] = useState<ExtractionPolicy>({
    discovery_mode: 'guided',
    discovery_instructions: '',
    discovery_review_policy: 'active',
    discovery_allow_inferred: true,
    discovery_max_per_episode: 5,
    judge_mode: 'smart',
    judge_model: '',
  });
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyDirty, setPolicyDirty] = useState(false);

  const fetchTopicsAndPolicy = async () => {
    try {
      setIsLoading(true);
      const [topicData, wsData] = await Promise.all([
        api.listTopics(false),
        api.getCurrentWorkspace(),
      ]);
      setTopics(topicData);
      if (wsData.extraction_policy) {
        setPolicy(wsData.extraction_policy);
        setPolicyDirty(false);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to load memory schema', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTopicsAndPolicy();
  }, [workspace?.id]);

  const handleSavePolicy = async () => {
    try {
      setIsSavingPolicy(true);
      const updatedWs = await api.updateCurrentWorkspacePolicy(policy);
      setPolicyDirty(false);
      notify('Workspace extraction policy saved', 'success');
      if (onWorkspaceUpdated) onWorkspaceUpdated(updatedWs);
    } catch (err: any) {
      notify(err.message || 'Failed to save policy', 'error');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const updatePolicyField = <K extends keyof ExtractionPolicy>(
    key: K,
    val: ExtractionPolicy[K]
  ) => {
    setPolicy((prev) => ({ ...prev, [key]: val }));
    setPolicyDirty(true);
  };

  const handleSaveTopic = async (topicData: any) => {
    if (editingTopic) {
      await api.updateTopic(editingTopic.id, topicData);
      notify(`Updated tag #${editingTopic.name}`, 'success');
    } else {
      await api.createTopic(topicData);
      notify(`Created tag #${topicData.name}`, 'success');
    }
    fetchTopicsAndPolicy();
  };

  const handleDeleteTopic = (topic: Topic) => {
    confirmAction({
      title: `Deactivate Tag #${topic.name}?`,
      description:
        'Existing memories assigned to this tag will be preserved, but the extraction engine will stop extracting new claims for this tag.',
      confirmLabel: 'Deactivate Tag',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteTopic(topic.id);
          notify(`Tag #${topic.name} deactivated`, 'info');
          fetchTopicsAndPolicy();
        } catch (err: any) {
          notify(err.message || 'Failed to deactivate tag', 'error');
        }
      },
    });
  };

  const handleReactivateTopic = async (topic: Topic) => {
    try {
      await api.updateTopic(topic.id, { is_active: true });
      notify(`Tag #${topic.name} reactivated`, 'success');
      fetchTopicsAndPolicy();
    } catch (err: any) {
      notify(err.message || 'Failed to reactivate tag', 'error');
    }
  };

  const handleSeedBundle = async (bundle: (typeof PRESET_BUNDLES)[0]) => {
    try {
      setSeedingBundle(bundle.id);
      let added = 0;
      for (const t of bundle.topics) {
        const exists = topics.some((existing) => existing.name === t.name);
        if (!exists) {
          try {
            await api.createTopic(t);
            added++;
          } catch {
            // Continue on conflict
          }
        }
      }
      notify(`Installed ${added} schema tag(s) from ${bundle.title}`, 'success');
      await fetchTopicsAndPolicy();
    } catch (err: any) {
      notify(err.message || 'Failed to install bundle', 'error');
    } finally {
      setSeedingBundle(null);
    }
  };

  const formatDataTypeBadge = (t: Topic) => {
    const dt = (t.data_type || 'text').toLowerCase();
    if (dt === 'boolean') return 'BOOLEAN';
    if (dt === 'enum' || dt === 'single_select') {
      return t.allow_custom_values ? 'SELECT + TEXT' : 'SINGLE SELECT';
    }
    if (dt === 'list' || dt === 'multi_select') {
      return t.enum_values && t.enum_values.length > 0
        ? t.allow_custom_values
          ? 'TAGS + TEXT'
          : 'CONSTRAINED TAGS'
        : 'LIST';
    }
    if (dt === 'number') {
      return t.constraints?.unit ? `NUMBER (${t.constraints.unit})` : 'NUMBER';
    }
    if (dt === 'date') return 'ISO DATE';
    return 'FREE TEXT';
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">PROGRAMMABLE STATE CONTRACT</div>
          <h1 className="page-title">Memory Schema &amp; Extraction Policy</h1>
          <p className="page-subtitle">
            Define typed memory tags (e.g. <code>is_vegan</code>, <code>known_allergies</code>), agent prompt rules, and whether the agent can store open discoveries.
          </p>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setEditingTopic(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={14} />
          <span>Define Memory Tag</span>
        </button>
      </div>

      {/* Section 1: Workspace Open-World Discovery Policy */}
      <div className="card mb-6">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <div>
            <div className="card-title" style={{ marginBottom: '2px' }}>
              Agent Discretion &amp; Unstructured Memory Policy
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Control whether the extraction agent is restricted strictly to your defined Memory Tags or allowed to record additional memories it deems important.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="segmented-control">
              {(
                [
                  { id: 'strict' as DiscoveryMode, label: 'Strict (Defined Tags Only)' },
                  { id: 'guided' as DiscoveryMode, label: 'Guided Hybrid (Recommended)' },
                  { id: 'open' as DiscoveryMode, label: 'Open Discovery' },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`segmented-option ${policy.discovery_mode === opt.id ? 'active' : ''}`}
                  onClick={() => updatePolicyField('discovery_mode', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {policyDirty && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSavePolicy}
                disabled={isSavingPolicy}
              >
                <Save size={13} />
                <span>{isSavingPolicy ? 'Saving…' : 'Save Policy'}</span>
              </button>
            )}
          </div>
        </div>

        {policy.discovery_mode === 'strict' ? (
          <div
            className="surface-ice"
            style={{
              padding: '14px 16px',
              borderLeft: '3px solid var(--signal-red)',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
            }}
          >
            <strong>Strict Schema Enforcement is active:</strong> The engine will ONLY store facts matching your active Memory Tags below. Any untagged or general claims extracted by the LLM are deterministically dropped.
          </div>
        ) : (
          <div
            className="surface-ice"
            style={{
              padding: '16px 18px',
              borderLeft: '3px solid var(--ultramarine)',
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            <div>
              <label className="input-label" style={{ fontSize: '12px' }}>
                Agent Focus &amp; Exclusion Instructions for Open Memories (Optional)
              </label>
              <textarea
                className="input"
                style={{ minHeight: '64px', fontSize: '12.5px', background: 'var(--bg-surface)' }}
                placeholder="Tell the agent what extra facts to look for and what to ignore. Example: Focus on patient scheduling constraints, family context, and upcoming blockers. Ignore small talk, weather, and one-off greetings."
                value={policy.discovery_instructions}
                onChange={(e) => updatePolicyField('discovery_instructions', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="input-label" style={{ fontSize: '12px' }}>
                  When Agent Discovers an Untagged Fact
                </label>
                <select
                  className="input"
                  style={{ fontSize: '12.5px', padding: '6px 28px 6px 10px' }}
                  value={policy.discovery_review_policy}
                  onChange={(e) =>
                    updatePolicyField(
                      'discovery_review_policy',
                      e.target.value as 'active' | 'pending_review'
                    )
                  }
                >
                  <option value="active">Activate immediately in profile state</option>
                  <option value="pending_review">Route to Review Queue for human approval</option>
                </select>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  marginTop: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={!policy.discovery_allow_inferred}
                  onChange={(e) => updatePolicyField('discovery_allow_inferred', !e.target.checked)}
                />
                <span>Only allow explicit statements for open discoveries (no inferences)</span>
              </label>
            </div>
          </div>
        )}

        {/* Adversarial Verification Judge Mode */}
        <div
          style={{
            marginTop: '18px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div>
            <div className="card-title" style={{ marginBottom: '2px' }}>
              Adversarial Verification Judge
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Second-pass critic that catches negations (&ldquo;not vegan&rdquo;), speaker mix-ups, and bad contradictions before state updates.
            </div>
          </div>

          <div className="segmented-control">
            {(
              [
                { id: 'off' as JudgeMode, label: 'Off' },
                { id: 'smart' as JudgeMode, label: 'Smart Escalation (Recommended)' },
                { id: 'always' as JudgeMode, label: 'Always Audit' },
              ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`segmented-option ${(policy.judge_mode || 'smart') === opt.id ? 'active' : ''}`}
                onClick={() => updatePolicyField('judge_mode', opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Defined Memory Tags Table */}
      <div className="table-container mb-6">
        <div className="table-header">
          <div>
            <h3 className="table-header-title">Defined Memory Tags ({topics.length})</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Structured state slots compiled into <code>intel.state</code> and enforced on every ingestion
            </span>
          </div>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setEditingTopic(null);
              setIsModalOpen(true);
            }}
          >
            <Plus size={12} />
            <span>Add Tag</span>
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Tag Key &amp; Label</th>
              <th>Type &amp; Allowed Values</th>
              <th>Resolution Mode</th>
              <th>Agent Instructions &amp; Guardrails</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="tag-pill">#{topic.name}</span>
                  </div>
                  {topic.label && topic.label !== topic.name && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', fontWeight: 500 }}>
                      {topic.label}
                    </div>
                  )}
                </td>

                <td style={{ maxWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral">{formatDataTypeBadge(topic)}</span>
                    {topic.ttl_days && (
                      <span className="badge badge-info">TTL {topic.ttl_days}d</span>
                    )}
                  </div>
                  {topic.enum_values && topic.enum_values.length > 0 && (
                    <div
                      className="mono"
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={topic.enum_values.join(', ')}
                    >
                      [{topic.enum_values.join(', ')}]
                    </div>
                  )}
                </td>

                <td style={{ whiteSpace: 'nowrap' }}>
                  {topic.update_policy === 'review' ? (
                    <span className="badge badge-warning">
                      <ShieldAlert size={11} />
                      Human Review ({topic.cardinality})
                    </span>
                  ) : topic.cardinality === 'single' ? (
                    <span className="badge badge-info">Single · Auto-Replace</span>
                  ) : (
                    <span className="badge badge-neutral">Multiple · Accumulate</span>
                  )}
                </td>

                <td style={{ maxWidth: '360px' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {topic.extraction_instructions || topic.description || (
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Standard schema extraction
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                    {topic.allow_inferred === false && (
                      <span className="badge badge-vermilion" style={{ fontSize: '10px' }}>
                        EXPLICIT ONLY
                      </span>
                    )}
                    {topic.applies_to_entity_types && topic.applies_to_entity_types.length > 0 && (
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                        Only: {topic.applies_to_entity_types.join(', ')}
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  <span className={`badge ${topic.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {topic.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => {
                        setEditingTopic(topic);
                        setIsModalOpen(true);
                      }}
                    >
                      Configure
                    </button>
                    {topic.is_active ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleDeleteTopic(topic)}
                        title="Deactivate Tag"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--success)' }}
                        onClick={() => handleReactivateTopic(topic)}
                      >
                        Enable
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {topics.length === 0 && !isLoading && (
          <div className="empty-state">
            <SlidersHorizontal className="empty-state-icon" />
            <h4 className="empty-state-title">No Memory Tags Defined Yet</h4>
            <p className="empty-state-text">
              Create custom tags (like <code>is_vegan</code> or <code>known_allergies</code>) or install one of the industry schema packs below.
            </p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditingTopic(null);
                setIsModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Define First Memory Tag</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 3: Curated Industry Schema Packs */}
      <div>
        <div className="card-title" style={{ marginBottom: '12px' }}>
          Starter Domain Schema Packs
        </div>

        <div className="grid-3">
          {PRESET_BUNDLES.map((bundle) => {
            const allInstalled = bundle.topics.every((bt) =>
              topics.some((t) => t.name === bt.name)
            );
            return (
              <div
                key={bundle.id}
                className="surface-ice"
                style={{
                  borderLeft: allInstalled ? '3px solid var(--teal)' : '3px solid var(--ultramarine)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    className="mono"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.07em',
                      marginBottom: '4px',
                    }}
                  >
                    {bundle.category}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {bundle.title}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.45 }}>
                    {bundle.description}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '16px' }}>
                    {bundle.topics.map((t) => (
                      <span key={t.name} className="tag-pill" style={{ fontSize: '11px' }}>
                        #{t.name}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={allInstalled || seedingBundle === bundle.id}
                  onClick={() => handleSeedBundle(bundle)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {allInstalled ? (
                    <>
                      <CheckCircle size={13} color="var(--success)" />
                      <span>Installed in Workspace</span>
                    </>
                  ) : seedingBundle === bundle.id ? (
                    <span>Installing…</span>
                  ) : (
                    <>
                      <Layers size={13} />
                      <span>Install Schema Pack</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <TopicModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveTopic}
        initialTopic={editingTopic}
      />
    </div>
  );
};
