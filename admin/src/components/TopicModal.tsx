import React, { useState, useEffect } from 'react';
import { X, SlidersHorizontal, ShieldAlert } from 'lucide-react';
import type { Topic, TopicCardinality, TopicConstraints, UpdatePolicy } from '../types';

interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    label: string;
    description: string;
    extraction_instructions: string;
    examples: string[];
    data_type: string;
    cardinality: TopicCardinality;
    update_policy: UpdatePolicy;
    temporal: boolean;
    ttl_days?: number | null;
    enum_values: string[];
    allow_custom_values: boolean;
    allow_inferred: boolean;
    min_confidence: number;
    constraints: TopicConstraints;
    applies_to_entity_types: string[];
  }) => Promise<void>;
  initialTopic?: Topic | null;
  presetDraft?: Partial<Topic> | null;
}

const ENTITY_TYPE_OPTIONS = [
  { id: 'person', label: 'Person / Patient / Client' },
  { id: 'organization', label: 'Organization / Account' },
  { id: 'product', label: 'Product / Service' },
  { id: 'location', label: 'Location / Facility' },
];

export const TopicModal: React.FC<TopicModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialTopic,
  presetDraft,
}) => {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [extractionInstructions, setExtractionInstructions] = useState('');
  const [examplesText, setExamplesText] = useState('');
  const [dataType, setDataType] = useState('text');
  const [cardinality, setCardinality] = useState<TopicCardinality>('single');
  const [updatePolicy, setUpdatePolicy] = useState<UpdatePolicy>('replace');
  const [ttlDaysStr, setTtlDaysStr] = useState('');

  // Select / Enum options
  const [enumChips, setEnumChips] = useState<string[]>([]);
  const [chipDraft, setChipDraft] = useState('');
  const [allowCustomValues, setAllowCustomValues] = useState(false);

  // Number constraints
  const [unit, setUnit] = useState('');
  const [minValStr, setMinValStr] = useState('');
  const [maxValStr, setMaxValStr] = useState('');

  // Guardrails
  const [allowInferred, setAllowInferred] = useState(true);
  const [minConfidencePct, setMinConfidencePct] = useState(0);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const src = initialTopic || presetDraft;
    if (src) {
      setName(src.name || '');
      setLabel(src.label || '');
      setDescription(src.description || '');
      setExtractionInstructions(src.extraction_instructions || '');
      setExamplesText(Array.isArray(src.examples) ? src.examples.join('\n') : '');
      setDataType(src.data_type || 'text');
      setCardinality(src.cardinality || 'single');
      setUpdatePolicy(src.update_policy || 'replace');
      setTtlDaysStr(src.ttl_days ? String(src.ttl_days) : '');
      setEnumChips(Array.isArray(src.enum_values) ? src.enum_values : []);
      setChipDraft('');
      setAllowCustomValues(Boolean(src.allow_custom_values));
      setAllowInferred(src.allow_inferred !== undefined ? Boolean(src.allow_inferred) : true);
      setMinConfidencePct(src.min_confidence ? Math.round(src.min_confidence * 100) : 0);
      setUnit(src.constraints?.unit || '');
      setMinValStr(src.constraints?.min != null ? String(src.constraints.min) : '');
      setMaxValStr(src.constraints?.max != null ? String(src.constraints.max) : '');
      setEntityTypes(Array.isArray(src.applies_to_entity_types) ? src.applies_to_entity_types : []);
    } else {
      setName('');
      setLabel('');
      setDescription('');
      setExtractionInstructions('');
      setExamplesText('');
      setDataType('boolean');
      setCardinality('single');
      setUpdatePolicy('replace');
      setTtlDaysStr('');
      setEnumChips([]);
      setChipDraft('');
      setAllowCustomValues(false);
      setAllowInferred(true);
      setMinConfidencePct(0);
      setUnit('');
      setMinValStr('');
      setMaxValStr('');
      setEntityTypes([]);
    }
    setError(null);
  }, [initialTopic, presetDraft, isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    if (!initialTopic) {
      const lower = nextName.toLowerCase();
      if (!label && nextName) {
        setLabel(
          nextName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }
      if (/(allergy|allergies|medical|health|medication|diagnosis|condition|budget|salary|security|compliance)/.test(lower)) {
        setUpdatePolicy('review');
        setAllowInferred(false);
      }
      if (/^(is_|has_|can_|requires_)/.test(lower)) {
        setDataType('boolean');
        setCardinality('single');
      }
    }
  };

  const handleDataTypeChange = (nextType: string) => {
    setDataType(nextType);
    if (nextType === 'boolean' || nextType === 'number' || nextType === 'date' || nextType === 'enum') {
      setCardinality('single');
      if (updatePolicy === 'append') setUpdatePolicy('replace');
    } else if (nextType === 'list') {
      setCardinality('multiple');
      if (updatePolicy === 'replace') setUpdatePolicy('append');
    }
  };

  const addChip = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...enumChips];
    for (const p of parts) {
      if (!next.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
        next.push(p);
      }
    }
    setEnumChips(next);
    setChipDraft('');
  };

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(chipDraft);
    } else if (e.key === 'Backspace' && !chipDraft && enumChips.length > 0) {
      setEnumChips(enumChips.slice(0, -1));
    }
  };

  const toggleEntityType = (et: string) => {
    if (entityTypes.includes(et)) {
      setEntityTypes(entityTypes.filter((x) => x !== et));
    } else {
      setEntityTypes([...entityTypes, et]);
    }
  };

  const selectUpdateMode = (mode: 'single_replace' | 'multiple_append' | 'human_review') => {
    if (mode === 'single_replace') {
      setCardinality('single');
      setUpdatePolicy('replace');
    } else if (mode === 'multiple_append') {
      setCardinality('multiple');
      setUpdatePolicy('append');
    } else {
      setUpdatePolicy('review');
    }
  };

  const currentUpdateMode =
    updatePolicy === 'review'
      ? 'human_review'
      : cardinality === 'single'
        ? 'single_replace'
        : 'multiple_append';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!cleanSlug) {
      setError('Tag identifier (slug) is required');
      return;
    }

    const finalChips = [...enumChips];
    if (chipDraft.trim()) {
      for (const p of chipDraft.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!finalChips.includes(p)) finalChips.push(p);
      }
    }

    const constraints: TopicConstraints = {};
    if (dataType === 'number') {
      if (unit.trim()) constraints.unit = unit.trim();
      if (minValStr.trim() !== '' && !isNaN(Number(minValStr))) constraints.min = Number(minValStr);
      if (maxValStr.trim() !== '' && !isNaN(Number(maxValStr))) constraints.max = Number(maxValStr);
    }

    const ttlDays = ttlDaysStr.trim() && Number(ttlDaysStr) > 0 ? Number(ttlDaysStr) : null;
    const examples = examplesText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        name: cleanSlug,
        label: label.trim() || cleanSlug,
        description: description.trim(),
        extraction_instructions: extractionInstructions.trim(),
        examples,
        data_type: dataType,
        cardinality,
        update_policy: updatePolicy,
        temporal: Boolean(ttlDays),
        ttl_days: ttlDays,
        enum_values: finalChips,
        allow_custom_values: allowCustomValues,
        allow_inferred: allowInferred,
        min_confidence: Math.max(0, Math.min(1, minConfidencePct / 100)),
        constraints,
        applies_to_entity_types: entityTypes,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save memory tag');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '660px', padding: '26px 30px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SlidersHorizontal size={18} />
              <span>{initialTopic ? `Edit Memory Tag: #${initialTopic.name}` : 'Define Memory Tag'}</span>
            </h3>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Configure data type, allowed values, conflict resolution, and instructions for the extraction agent.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
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
          {/* 1. Identity */}
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Tag Key (Machine Slug) *</label>
              <input
                type="text"
                className="input mono"
                placeholder="e.g. is_vegan, known_allergies, annual_budget"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                disabled={!!initialTopic}
              />
              <span className="input-hint">
                Key used in <code>intel.state[&quot;{name || 'is_vegan'}&quot;]</code>
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Display Label</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Vegan Diet, Known Allergies"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <span className="input-hint">Human-readable title shown in profile sheets.</span>
            </div>
          </div>

          {/* 2. Data Type & Value Contract */}
          <div className="input-group">
            <label className="input-label">Value Data Type *</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              {[
                { id: 'boolean', title: 'Boolean Flag', desc: 'true / false (e.g. is_vegan)' },
                { id: 'enum', title: 'Single Select', desc: 'One value from options' },
                { id: 'list', title: 'Multi-Select / List', desc: 'Multiple tags or items' },
                { id: 'number', title: 'Number', desc: 'Amount, score, or count' },
                { id: 'date', title: 'Date (ISO)', desc: 'Calendar YYYY-MM-DD' },
                { id: 'text', title: 'Free Text', desc: 'Open text statement' },
              ].map((dt) => {
                const active =
                  dataType === dt.id ||
                  (dt.id === 'enum' && dataType === 'single_select') ||
                  (dt.id === 'list' && dataType === 'multi_select');
                return (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => handleDataTypeChange(dt.id)}
                    style={{
                      padding: '9px 11px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--bg-well)' : 'var(--bg-surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {dt.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {dt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allowed Values Chip Builder for Single Select / Multi-Select */}
          {(dataType === 'enum' ||
            dataType === 'single_select' ||
            dataType === 'list' ||
            dataType === 'multi_select') && (
            <div
              style={{
                padding: '14px',
                background: 'var(--bg-well)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '16px',
              }}
            >
              <label className="input-label">
                {dataType === 'list' || dataType === 'multi_select'
                  ? 'Predefined Option Tags (Optional — leave empty to allow any list items)'
                  : 'Allowed Option Values'}
              </label>
              <div className="chip-input-box">
                {enumChips.map((chip) => (
                  <span key={chip} className="chip-item">
                    <span>{chip}</span>
                    <button
                      type="button"
                      className="chip-remove"
                      onClick={() => setEnumChips(enumChips.filter((c) => c !== chip))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-mono)',
                    flex: 1,
                    minWidth: '150px',
                    padding: '2px 4px',
                  }}
                  placeholder={
                    enumChips.length === 0
                      ? 'Type option and press Enter (e.g. peanuts, penicillin, dairy)...'
                      : 'Add another option...'
                  }
                  value={chipDraft}
                  onChange={(e) => setChipDraft(e.target.value)}
                  onKeyDown={handleChipKeyDown}
                  onBlur={() => chipDraft.trim() && addChip(chipDraft)}
                />
              </div>

              {enumChips.length > 0 && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '10px',
                    fontSize: '12.5px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowCustomValues}
                    onChange={(e) => setAllowCustomValues(e.target.checked)}
                  />
                  <span>
                    <strong>Allow free-text fallback:</strong> Agent prefers the options above, but can store custom values outside the list without quarantining.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Numeric Constraints */}
          {dataType === 'number' && (
            <div
              className="grid-3"
              style={{
                padding: '12px 14px',
                background: 'var(--bg-well)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '16px',
              }}
            >
              <div>
                <label className="input-label" style={{ fontSize: '11.5px' }}>
                  Unit (Optional)
                </label>
                <input
                  type="text"
                  className="input mono"
                  placeholder="USD, years, mg, %"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label" style={{ fontSize: '11.5px' }}>
                  Minimum Value
                </label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  placeholder="e.g. 0"
                  value={minValStr}
                  onChange={(e) => setMinValStr(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label" style={{ fontSize: '11.5px' }}>
                  Maximum Value
                </label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  placeholder="e.g. 1000000"
                  value={maxValStr}
                  onChange={(e) => setMaxValStr(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* 3. Update & Conflict Mode */}
          <div className="input-group">
            <label className="input-label">State Resolution &amp; Update Policy</label>
            <div className="grid-3">
              {[
                {
                  id: 'single_replace' as const,
                  title: 'Single Current Value',
                  desc: 'One active value per entity. Newer facts automatically supersede older ones.',
                },
                {
                  id: 'multiple_append' as const,
                  title: 'Accumulate Values',
                  desc: 'Multiple facts coexist (e.g. multiple allergies, preferences, or notes).',
                },
                {
                  id: 'human_review' as const,
                  title: 'Human Review Required',
                  desc: 'Route changes or conflicts to the Review Queue before altering confirmed state.',
                },
              ].map((m) => {
                const active = currentUpdateMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectUpdateMode(m.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--bg-well)' : 'var(--bg-surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      {m.id === 'human_review' && <ShieldAlert size={13} color="var(--warning)" />}
                      <span>{m.title}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.35 }}>
                      {m.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Agent Instructions & Description */}
          <div className="input-group">
            <label className="input-label">What This Tag Represents (Summary)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Whether the patient/customer follows a strictly plant-based vegan diet."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Agent Extraction Instructions (Prompt Rules)</label>
            <textarea
              className="input"
              style={{ minHeight: '78px', fontSize: '13px' }}
              placeholder="Specific rules for the AI agent. Example: Set to true ONLY if the person explicitly states they are vegan or strictly plant-based. Do NOT infer true from ordering a single vegan meal or being vegetarian."
              value={extractionInstructions}
              onChange={(e) => setExtractionInstructions(e.target.value)}
            />
            <span className="input-hint">
              Injected directly into the extraction prompt for this tag to eliminate false positives.
            </span>
          </div>

          <div className="input-group">
            <label className="input-label">Positive / Negative Examples (Optional, one per line)</label>
            <textarea
              className="input mono"
              style={{ minHeight: '56px', fontSize: '12px' }}
              placeholder={`"I've been strictly vegan for 4 years" -> true\n"I ordered the vegan salad today" -> abstain`}
              value={examplesText}
              onChange={(e) => setExamplesText(e.target.value)}
            />
          </div>

          {/* 5. Guardrails & Scope */}
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--bg-well)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!allowInferred}
                  onChange={(e) => setAllowInferred(!e.target.checked)}
                />
                <span>
                  <strong>Explicit statements only:</strong> Disallow agent guesses/inferences for this tag
                </span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Auto-expire (TTL days):</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  className="input mono"
                  style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }}
                  placeholder="Never"
                  value={ttlDaysStr}
                  onChange={(e) => setTtlDaysStr(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Applies to Entity Types {entityTypes.length === 0 && '(All types)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {ENTITY_TYPE_OPTIONS.map((opt) => {
                  const selected = entityTypes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`btn btn-xs ${selected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => toggleEntityType(opt.id)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : initialTopic ? 'Save Tag Changes' : 'Create Memory Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
