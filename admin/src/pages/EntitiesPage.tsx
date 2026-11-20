import React, { useState, useEffect } from 'react';
import {
  Search,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Entity, Topic } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface EntitiesPageProps {
  onSelectEntity: (entityId: number) => void;
  onOpenNewEntity: () => void;
}

export const EntitiesPage: React.FC<EntitiesPageProps> = ({
  onSelectEntity,
  onOpenNewEntity,
}) => {
  const { notify, confirmAction } = useToast();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Structured state query filters (?where=...)
  const [whereFilters, setWhereFilters] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterOp, setFilterOp] = useState<string>('=');
  const [filterVal, setFilterVal] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [seedingDemo, setSeedingDemo] = useState<'clinical' | 'saas' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTopics(true)
      .then((t) => {
        setTopics(t);
        if (t.length > 0 && !filterTag) {
          setFilterTag(t[0].name);
        }
      })
      .catch(() => {});
  }, []);

  const fetchEntities = async () => {
    try {
      setIsLoading(true);
      const data = await api.listEntities(search, 100, 0, whereFilters);
      setEntities(data);
    } catch (err: any) {
      notify(err.message || 'Failed to load profiles', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntities();
    }, 180);
    return () => clearTimeout(timer);
  }, [search, whereFilters]);

  const handleAddStateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = filterTag.trim();
    const val = filterVal.trim();
    if (!tag || !val) return;
    const expr = `${tag}${filterOp}${val}`;
    if (!whereFilters.includes(expr)) {
      setWhereFilters((prev) => [...prev, expr]);
    }
    setFilterVal('');
  };

  const handleRemoveFilter = (expr: string) => {
    setWhereFilters((prev) => prev.filter((item) => item !== expr));
  };

  const handleSeedDemo = async (preset: 'clinical' | 'saas') => {
    try {
      setSeedingDemo(preset);
      const res = await api.seedDemoWorkspace(preset);
      notify(
        `Loaded ${preset === 'clinical' ? 'Clinical Intake' : 'Enterprise SaaS'} demo (${res.entities_created} profiles)`,
        'success'
      );
      const t = await api.listTopics(true);
      setTopics(t);
      if (t.length > 0) setFilterTag(t[0].name);
      await fetchEntities();
    } catch (err: any) {
      notify(err.message || 'Failed to load sample data', 'error');
    } finally {
      setSeedingDemo(null);
    }
  };

  const handleDeleteEntity = (entity: Entity, e: React.MouseEvent) => {
    e.stopPropagation();
    confirmAction({
      title: `Delete Profile "${entity.name || entity.external_id}"?`,
      description:
        'This permanently deletes the profile and all associated memories, source episodes, and evidence spans.',
      confirmLabel: 'Delete Profile',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deleteEntity(entity.id);
          setEntities((prev) => prev.filter((ent) => ent.id !== entity.id));
          notify(`Deleted profile ${entity.name || entity.external_id}`, 'info');
        } catch (err: any) {
          notify(err.message || 'Failed to delete profile', 'error');
        }
      },
    });
  };

  const handleCopyId = (externalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(externalId);
    setCopiedId(externalId);
    notify(`Copied external ID: ${externalId}`, 'info');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredEntities = entities.filter((ent) => {
    if (typeFilter === 'all') return true;
    return ent.entity_type === typeFilter;
  });

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatStateValue = (val: unknown): string => {
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">ENTITY DIRECTORY</div>
          <h1 className="page-title">Profiles</h1>
        </div>

        <button className="btn btn-primary btn-sm" onClick={onOpenNewEntity}>
          <span>+ New Profile -&gt;</span>
        </button>
      </div>

      {/* Borderless Search & Classification Sub-Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div className="search-bar" style={{ flex: 1, minWidth: '240px', maxWidth: '380px' }}>
          <Search className="search-bar-icon" size={14} />
          <input
            type="text"
            className="input"
            placeholder="Search by name or external ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="segmented-control">
          {(['all', 'person', 'organization', 'product', 'location', 'custom'] as const).map(
            (type) => (
              <button
                key={type}
                type="button"
                className={`segmented-option ${typeFilter === type ? 'active' : ''}`}
                onClick={() => setTypeFilter(type)}
                style={{ textTransform: 'uppercase' }}
              >
                {type === 'all' ? 'All Profiles' : type}
              </button>
            )
          )}
        </div>
      </div>

      {/* Structured State Filter Bar (?where=...) */}
      {topics.length > 0 && (
        <div
          className="surface-ice"
          style={{
            padding: '12px 16px',
            marginBottom: '22px',
            borderLeft: whereFilters.length > 0 ? '3px solid var(--ultramarine)' : '3px solid var(--border-subtle)',
          }}
        >
          <form
            onSubmit={handleAddStateFilter}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <SlidersHorizontal size={12} />
              <span>Filter by State</span>
            </span>

            <select
              className="input mono"
              style={{ width: '190px', fontSize: '12px', padding: '5px 24px 5px 8px', background: '#FFFFFF' }}
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.data_type})
                </option>
              ))}
            </select>

            <select
              className="input mono"
              style={{ width: '92px', fontSize: '12px', padding: '5px 20px 5px 8px', background: '#FFFFFF' }}
              value={filterOp}
              onChange={(e) => setFilterOp(e.target.value)}
            >
              <option value="=">=</option>
              <option value="!=">!=</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
            </select>

            <input
              type="text"
              className="input mono"
              style={{ width: '180px', fontSize: '12px', padding: '5px 8px', background: '#FFFFFF' }}
              placeholder="e.g. true, penicillin, 25000"
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
            />

            <button type="submit" className="btn btn-secondary btn-xs" disabled={!filterTag || !filterVal.trim()}>
              + Apply Filter
            </button>

            {whereFilters.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setWhereFilters([])}
              >
                Clear All
              </button>
            )}
          </form>

          {whereFilters.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
              {whereFilters.map((expr) => (
                <span
                  key={expr}
                  className="mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: 'var(--ultramarine)',
                  }}
                >
                  <span>where {expr}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFilter(expr)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                    }}
                    title="Remove filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Borderless Typographic Directory */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Profile &amp; Compiled State</th>
              <th>External ID</th>
              <th>Classification</th>
              <th>Active State</th>
              <th>Tracked Since</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.map((entity) => {
              const stateEntries = Object.entries(entity.state || {}).slice(0, 3);
              return (
                <tr
                  key={entity.id}
                  className="clickable"
                  onClick={() => onSelectEntity(entity.id)}
                >
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                      {entity.name || 'Unnamed Profile'}
                    </div>
                    {stateEntries.length > 0 && (
                      <div
                        className="mono"
                        style={{
                          marginTop: '3px',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {stateEntries.map(([k, v]) => (
                          <span key={k}>
                            <span style={{ color: 'var(--ultramarine)' }}>{k}</span>={formatStateValue(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span className="mono" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {entity.external_id}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs row-action-reveal"
                        title="Copy External ID"
                        onClick={(e) => handleCopyId(entity.external_id, e)}
                        style={{ padding: '2px 4px' }}
                      >
                        {copiedId === entity.external_id ? (
                          <Check size={12} color="var(--teal)" />
                        ) : (
                          <Copy size={12} color="var(--text-muted)" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{entity.entity_type}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>
                      {entity.memory_count ?? 0}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      facts
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(entity.created_at)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div
                      className="row-action-reveal"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 600,
                          color: 'var(--ultramarine)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>Inspect</span>
                        <ArrowRight size={12} />
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--signal-red)' }}
                        onClick={(e) => handleDeleteEntity(entity, e)}
                        title="Delete Profile"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredEntities.length === 0 && !isLoading && (
          <div className="surface-ice empty-state" style={{ marginTop: '12px' }}>
            <h4 className="empty-state-title">
              {whereFilters.length > 0 ? 'No Profiles Match State Filters' : 'No Profiles Found'}
            </h4>
            <p className="empty-state-text">
              {whereFilters.length > 0
                ? 'Adjust or clear your compiled state filters above.'
                : search
                  ? `No profiles matching "${search}".`
                  : 'Create your first profile or load a 1-click sample dataset to explore verified ledgers.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={onOpenNewEntity}>
                <span>+ New Profile -&gt;</span>
              </button>
              {whereFilters.length === 0 && !search && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={seedingDemo !== null}
                    onClick={() => handleSeedDemo('clinical')}
                  >
                    {seedingDemo === 'clinical' ? 'Loading…' : 'Load Clinical Demo'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={seedingDemo !== null}
                    onClick={() => handleSeedDemo('saas')}
                  >
                    {seedingDemo === 'saas' ? 'Loading…' : 'Load SaaS Demo'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
