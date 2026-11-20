import React, { useState, useEffect } from 'react';
import {
  Search,
  Trash2,
  Copy,
  Check,
  ArrowRight,
} from 'lucide-react';
import type { Entity } from '../types';
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchEntities = async () => {
    try {
      setIsLoading(true);
      const data = await api.listEntities(search, 100);
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
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

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

      {/* Borderless Search & Filter Sub-Bar (Zero Boxes!) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '24px',
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

      {/* Borderless Typographic Directory (Zero Pill/Button/Avatar Boxes!) */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>External ID</th>
              <th>Classification</th>
              <th>Active State</th>
              <th>Tracked Since</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.map((entity) => (
              <tr
                key={entity.id}
                className="clickable"
                onClick={() => onSelectEntity(entity.id)}
              >
                <td>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                    {entity.name || 'Unnamed Profile'}
                  </div>
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
            ))}
          </tbody>
        </table>

        {filteredEntities.length === 0 && !isLoading && (
          <div className="surface-ice empty-state" style={{ marginTop: '12px' }}>
            <h4 className="empty-state-title">No Profiles Found</h4>
            <p className="empty-state-text">
              {search
                ? `No profiles matching "${search}".`
                : 'Create your first profile or ingest a record to start tracking entity state.'}
            </p>
            <button className="btn btn-primary btn-sm" onClick={onOpenNewEntity}>
              <span>+ New Profile -&gt;</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
