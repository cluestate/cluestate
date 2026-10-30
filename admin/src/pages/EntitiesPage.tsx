import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Brain,
  Filter,
} from 'lucide-react';
import type { Entity } from '../types';
import { api } from '../api';

interface EntitiesPageProps {
  onSelectEntity: (entityId: number) => void;
  onOpenNewEntity: () => void;
}

export const EntitiesPage: React.FC<EntitiesPageProps> = ({
  onSelectEntity,
  onOpenNewEntity,
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchEntities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.listEntities(search, 100);
      setEntities(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load entities');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEntities();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleDeleteEntity = async (entityId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this entity and all associated memories and episodes?')) {
      return;
    }

    try {
      await api.deleteEntity(entityId);
      setEntities(entities.filter((ent) => ent.id !== entityId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete entity');
    }
  };

  const handleCopyId = (externalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(externalId);
    setCopiedId(externalId);
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Tracked Entities</h1>
          <p className="page-subtitle">
            Customers, patients, users, or organizations with continuously evolving intelligence profiles.
          </p>
        </div>

        <button className="btn btn-primary" onClick={onOpenNewEntity}>
          <UserPlus size={16} />
          <span>New Entity</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Filter / Search Bar */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: '260px' }}>
          <Search className="search-bar-icon" size={16} />
          <input
            type="text"
            className="input"
            placeholder="Search entities by name or external ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Filter size={15} color="var(--text-muted)" />
          {(['all', 'person', 'organization', 'product', 'location', 'custom'] as const).map((type) => (
            <button
              key={type}
              className={`btn btn-sm ${typeFilter === type ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTypeFilter(type)}
              style={{ textTransform: 'capitalize' }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Entities Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>External ID</th>
              <th>Type</th>
              <th>Active Facts</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.map((entity) => (
              <tr key={entity.id} onClick={() => onSelectEntity(entity.id)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--accent-primary-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '14px',
                      }}
                    >
                      {entity.name ? entity.name[0].toUpperCase() : 'E'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {entity.name || 'Unnamed Entity'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        ID #{entity.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <code
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'var(--text-accent)',
                      }}
                    >
                      {entity.external_id}
                    </code>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 6px', height: 'auto' }}
                      title="Copy External ID"
                      onClick={(e) => handleCopyId(entity.external_id, e)}
                    >
                      {copiedId === entity.external_id ? (
                        <Check size={12} color="var(--success)" />
                      ) : (
                        <Copy size={12} color="var(--text-muted)" />
                      )}
                    </button>
                  </div>
                </td>
                <td>
                  <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                    {entity.entity_type}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Brain size={14} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {entity.memory_count ?? 0}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>memories</span>
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {formatDate(entity.created_at)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEntity(entity.id);
                      }}
                      title="View Profile"
                    >
                      <span>Intel</span>
                      <ExternalLink size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={(e) => handleDeleteEntity(entity.id, e)}
                      title="Delete Entity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredEntities.length === 0 && !isLoading && (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <h4 className="empty-state-title">No Entities Found</h4>
            <p className="empty-state-text">
              {search
                ? `No entities matching "${search}".`
                : 'Start tracking people, organizations, or products to build intelligence profiles.'}
            </p>
            <button className="btn btn-primary" onClick={onOpenNewEntity}>
              <UserPlus size={16} />
              <span>Track First Entity</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
