import React, { useState, useEffect } from 'react';
import {
  Tags,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle,
  Layers,
} from 'lucide-react';
import type { Topic, TopicCardinality, UpdatePolicy } from '../types';
import { api } from '../api';
import { TopicModal } from '../components/TopicModal';

const PRESET_BUNDLES: {
  id: string;
  title: string;
  description: string;
  topics: {
    name: string;
    description: string;
    data_type: string;
    cardinality: TopicCardinality;
    update_policy: UpdatePolicy;
  }[];
}[] = [
  {
    id: 'saas',
    title: 'SaaS & B2B Sales',
    description: 'Track prospect tech stacks, pain points, budget authority, and renewal dates.',
    topics: [
      {
        name: 'pain_points',
        description: 'Business challenges, friction, and bottlenecks mentioned by the client.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'tech_stack',
        description: 'Tools, platforms, programming languages, and databases currently used.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'budget',
        description: 'Current approved budget cap or contract spend target.',
        data_type: 'number',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'decision_maker',
        description: 'Primary decision maker or executive sponsor.',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'renewal_timeline',
        description: 'Target contract renewal date or evaluation deadline.',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
    ],
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce & Retail',
    description: 'Maintain customer brand preferences, sizing, and price sensitivity.',
    topics: [
      {
        name: 'brand_preferences',
        description: 'Preferred brands, product lines, and style categories.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'sizing',
        description: 'Current clothing or footwear size specifications.',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'price_sensitivity',
        description: 'Budget orientation (value, mid-tier, premium).',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'delivery_preferences',
        description: 'Preferred shipping carrier, delivery window, or packaging instructions.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
    ],
  },
  {
    id: 'support',
    title: 'Customer Support & Success',
    description: 'Track communication preferences, recurring issues, and account tier.',
    topics: [
      {
        name: 'communication_channel',
        description: 'Preferred contact method (email, Slack, phone, SMS).',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
      {
        name: 'known_workflows',
        description: 'Key workflows and integrations the customer relies on.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'past_issues',
        description: 'Previously reported technical issues and verified resolutions.',
        data_type: 'list',
        cardinality: 'multiple',
        update_policy: 'append',
      },
      {
        name: 'account_tier',
        description: 'Current subscription plan or service level.',
        data_type: 'text',
        cardinality: 'single',
        update_policy: 'replace',
      },
    ],
  },
];

export const TopicsPage: React.FC = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [seedingBundle, setSeedingBundle] = useState<string | null>(null);

  const fetchTopics = async () => {
    try {
      setIsLoading(true);
      const data = await api.listTopics(false);
      setTopics(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTopics();
  }, []);

  const handleCreateTopic = async (topicData: any) => {
    if (editingTopic) {
      await api.updateTopic(editingTopic.id, topicData);
    } else {
      await api.createTopic(topicData);
    }
    fetchTopics();
  };

  const handleDeleteTopic = async (topicId: number) => {
    if (!confirm('Are you sure you want to deactivate this topic?')) return;
    try {
      await api.deleteTopic(topicId);
      fetchTopics();
    } catch (err: any) {
      alert(err.message || 'Failed to delete topic');
    }
  };

  const handleSeedBundle = async (bundle: typeof PRESET_BUNDLES[0]) => {
    try {
      setSeedingBundle(bundle.id);
      for (const t of bundle.topics) {
        const exists = topics.some((existing) => existing.name === t.name);
        if (!exists) {
          try {
            await api.createTopic(t);
          } catch {
            // Continue if conflict
          }
        }
      }
      await fetchTopics();
    } catch (err: any) {
      alert(err.message || 'Failed to seed bundle');
    } finally {
      setSeedingBundle(null);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Customer State Schemas</h1>
          <p className="page-subtitle">
            Define typed attributes, cardinality (single vs. multiple), and conflict resolution policies.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingTopic(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={16} />
          <span>Add Schema Topic</span>
        </button>
      </div>

      {/* Preset Bundles Banner */}
      <div className="card mb-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Sparkles size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Domain Schema Bundles
          </h3>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Pre-configured topic schemas with appropriate cardinality and replacement rules.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {PRESET_BUNDLES.map((bundle) => {
            const allInstalled = bundle.topics.every((bt) =>
              topics.some((t) => t.name === bt.name)
            );
            return (
              <div
                key={bundle.id}
                style={{
                  padding: '16px',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {bundle.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                    {bundle.description}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '14px' }}>
                    {bundle.topics.map((t) => (
                      <span
                        key={t.name}
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: 'var(--accent-primary-hover)',
                          borderRadius: '4px',
                        }}
                      >
                        #{t.name} ({t.cardinality})
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  disabled={allInstalled || seedingBundle === bundle.id}
                  onClick={() => handleSeedBundle(bundle)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {allInstalled ? (
                    <>
                      <CheckCircle size={13} color="var(--success)" />
                      <span>Installed</span>
                    </>
                  ) : seedingBundle === bundle.id ? (
                    'Installing...'
                  ) : (
                    <>
                      <Layers size={13} />
                      <span>Install Bundle</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Topics Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Topic Slug</th>
              <th>Extraction Instructions</th>
              <th>Type</th>
              <th>Cardinality & Policy</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id}>
                <td>
                  <code
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--accent-primary-hover)',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    #{topic.name}
                  </code>
                </td>
                <td style={{ maxWidth: '360px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    {topic.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No custom instructions</span>}
                  </div>
                </td>
                <td>
                  <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                    {topic.data_type}
                  </span>
                </td>
                <td>
                  <span className="badge badge-info" style={{ fontSize: '11px' }}>
                    {topic.cardinality || 'multiple'} &bull; {topic.update_policy || 'append'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${topic.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {topic.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingTopic(topic);
                        setIsModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    {topic.is_active && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleDeleteTopic(topic.id)}
                        title="Deactivate Topic"
                      >
                        <Trash2 size={14} />
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
            <Tags className="empty-state-icon" />
            <h4 className="empty-state-title">No Schema Topics Defined</h4>
            <p className="empty-state-text">
              Install a domain bundle above or create custom state categories.
            </p>
          </div>
        )}
      </div>

      <TopicModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateTopic}
        initialTopic={editingTopic}
      />
    </div>
  );
};
