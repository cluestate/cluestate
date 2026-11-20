export type EntityType = 'person' | 'organization' | 'product' | 'location' | 'custom';

export type MemoryStatus = 'active' | 'confirmed' | 'pending_review' | 'rejected' | 'superseded';

export type ClaimType = 'explicit' | 'inferred' | 'observed';

export type TopicCardinality = 'single' | 'multiple';

export type UpdatePolicy = 'replace' | 'append' | 'review';

export type DefaultSourceType =
  | 'conversation'
  | 'note'
  | 'interaction'
  | 'custom'
  | 'email'
  | 'survey'
  | 'purchase'
  | 'support_ticket'
  | 'call_transcript'
  | 'app_interaction'
  | 'review'
  | 'social_media';

export type SourceType = DefaultSourceType | (string & {});

export interface SourceTypesResponse {
  source_types: string[];
  defaults: string[];
}

export interface ClueStateOptions {
  /** Workspace API key (`cs_live_...`) or session token. Defaults to process.env.CLUESTATE_API_KEY */
  apiKey?: string;
  /** Base URL of the ClueState server. Defaults to process.env.CLUESTATE_API_URL or https://app.cluestate.com */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Optional custom fetch implementation */
  fetch?: typeof fetch;
}

export interface Evidence {
  id: number;
  episode_id: number;
  excerpt: string;
  is_verified: boolean;
  char_start: number | null;
  char_end: number | null;
  content_hash: string;
  created_at: string;
}

export interface Memory {
  id: number;
  entity_id: number;
  topic_id: number | null;
  topic_name: string | null;
  claim: string;
  value: string;
  structured_value: unknown;
  claim_type: ClaimType;
  confidence: number;
  status: MemoryStatus;
  judge_note?: string | null;
  superseded_by_id: number | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
  evidence: Evidence[];
}

export interface Entity {
  id: number;
  external_id: string;
  name: string;
  entity_type: EntityType;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  memory_count: number;
  state?: Record<string, unknown>;
  memories?: Memory[];
}

export interface Topic {
  id: number;
  name: string;
  label?: string;
  description: string;
  extraction_instructions?: string;
  examples?: unknown[];
  data_type: 'text' | 'number' | 'boolean' | 'enum' | 'list' | 'single_select' | 'multi_select' | 'date' | string;
  cardinality: TopicCardinality;
  update_policy: UpdatePolicy;
  temporal: boolean;
  ttl_days?: number | null;
  enum_values: string[];
  allow_custom_values?: boolean;
  allow_inferred?: boolean;
  min_confidence?: number;
  constraints?: Record<string, unknown>;
  applies_to_entity_types?: string[];
  schema_version: number;
  is_active: boolean;
  created_at: string;
}

export interface Episode {
  id: number;
  entity_id: number;
  source_type: SourceType;
  source_record_id: string | null;
  content: string;
  content_hash: string;
  source_description: string;
  meta: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface IngestParams {
  content: string;
  externalId?: string;
  external_id?: string;
  entityId?: number;
  entity_id?: number;
  entityName?: string;
  entity_name?: string;
  sourceType?: SourceType;
  source_type?: SourceType;
  sourceRecordId?: string;
  source_record_id?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  occurredAt?: string | Date;
  occurred_at?: string | Date;
  sourceDescription?: string;
  source_description?: string;
  meta?: Record<string, unknown>;
  autoCreateEntity?: boolean;
  auto_create_entity?: boolean;
  dryRun?: boolean;
  dry_run?: boolean;
  mode?: 'sync' | 'async';
  queueOnError?: boolean;
  queue_on_error?: boolean;
}

export interface JudgeRejectedItem {
  claim: string;
  topic_name?: string | null;
  value: string;
  reason: string;
}

export interface IngestResponse {
  episode_id: number;
  entity_id: number;
  memories_extracted: number;
  memories_updated: number;
  memories_new: number;
  idempotent_replay: boolean;
  dry_run?: boolean;
  job_id?: number | null;
  job_status?: string | null;
  judge_applied?: boolean;
  judge_rejected?: JudgeRejectedItem[];
  state?: Record<string, unknown>;
  memories: Memory[];
}

export interface IntelResponse {
  entity_id: number;
  entity_name: string;
  entity_type: EntityType;
  formatted_prompt: string;
  state: Record<string, unknown>;
  memories: Memory[];
  total_memories: number;
  total_episodes: number;
}

export interface CreateEntityParams {
  externalId?: string;
  external_id?: string;
  name?: string;
  entityType?: EntityType;
  entity_type?: EntityType;
  meta?: Record<string, unknown>;
}

export interface ListEntitiesParams {
  search?: string;
  limit?: number;
  offset?: number;
  where?: string[];
}

export interface ListMemoriesParams {
  entityId: number;
  status?: MemoryStatus;
  topicId?: number;
}

export interface UpdateMemoryParams {
  status?: MemoryStatus;
  confidence?: number;
}

export interface CreateTopicParams {
  name: string;
  label?: string;
  description?: string;
  extractionInstructions?: string;
  extraction_instructions?: string;
  examples?: unknown[];
  dataType?: 'text' | 'number' | 'boolean' | 'enum' | 'list' | 'single_select' | 'multi_select' | 'date' | string;
  data_type?: 'text' | 'number' | 'boolean' | 'enum' | 'list' | 'single_select' | 'multi_select' | 'date' | string;
  cardinality?: TopicCardinality;
  updatePolicy?: UpdatePolicy;
  update_policy?: UpdatePolicy;
  temporal?: boolean;
  ttlDays?: number | null;
  ttl_days?: number | null;
  enumValues?: string[];
  enum_values?: string[];
  allowCustomValues?: boolean;
  allow_custom_values?: boolean;
  allowInferred?: boolean;
  allow_inferred?: boolean;
  minConfidence?: number;
  min_confidence?: number;
  constraints?: Record<string, unknown>;
  appliesToEntityTypes?: string[];
  applies_to_entity_types?: string[];
}

export interface UpdateTopicParams {
  label?: string;
  description?: string;
  extractionInstructions?: string;
  extraction_instructions?: string;
  examples?: unknown[];
  dataType?: string;
  data_type?: string;
  cardinality?: TopicCardinality;
  updatePolicy?: UpdatePolicy;
  update_policy?: UpdatePolicy;
  temporal?: boolean;
  ttlDays?: number | null;
  ttl_days?: number | null;
  enumValues?: string[];
  enum_values?: string[];
  allowCustomValues?: boolean;
  allow_custom_values?: boolean;
  allowInferred?: boolean;
  allow_inferred?: boolean;
  minConfidence?: number;
  min_confidence?: number;
  constraints?: Record<string, unknown>;
  appliesToEntityTypes?: string[];
  applies_to_entity_types?: string[];
  isActive?: boolean;
  is_active?: boolean;
}

