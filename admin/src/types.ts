export type EntityType = 'person' | 'organization' | 'product' | 'location' | 'custom';

export type MemoryStatus = 'active' | 'confirmed' | 'pending_review' | 'rejected' | 'superseded';

export type ClaimType = 'explicit' | 'inferred' | 'observed';

export type TopicCardinality = 'single' | 'multiple';

export type UpdatePolicy = 'replace' | 'append' | 'review';

export type SourceType =
  | 'conversation'
  | 'email'
  | 'survey'
  | 'purchase'
  | 'support_ticket'
  | 'call_transcript'
  | 'app_interaction'
  | 'review'
  | 'social_media'
  | 'note'
  | 'custom';

export interface User {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  workspace: Workspace;
  initial_api_key?: string | null;
}

export interface ApiKeyItem {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at?: string | null;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKeyItem {
  raw_key: string;
}

export interface Evidence {
  id: number;
  episode_id: number;
  excerpt: string;
  is_verified: boolean;
  char_start?: number | null;
  char_end?: number | null;
  content_hash?: string;
  created_at: string;
}

export interface Memory {
  id: number;
  entity_id: number;
  topic_id?: number | null;
  topic_name?: string | null;
  claim: string;
  value: string;
  structured_value?: any;
  claim_type: ClaimType;
  confidence: number;
  status: MemoryStatus;
  superseded_by_id?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  created_at: string;
  updated_at: string;
  evidence?: Evidence[];
}

export interface Entity {
  id: number;
  external_id: string;
  name: string;
  entity_type: EntityType;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
  memory_count?: number;
  memories?: Memory[];
}

export interface Topic {
  id: number;
  name: string;
  description: string;
  data_type: string;
  cardinality: TopicCardinality;
  update_policy: UpdatePolicy;
  temporal: boolean;
  enum_values: string[];
  schema_version: number;
  is_active: boolean;
  created_at: string;
}

export interface Episode {
  id: number;
  entity_id: number;
  source_type: SourceType;
  source_record_id?: string | null;
  content: string;
  content_hash?: string;
  source_description: string;
  meta: Record<string, any>;
  occurred_at: string;
  created_at: string;
}

export interface DashboardStats {
  total_entities: number;
  total_memories: number;
  active_memories: number;
  total_episodes: number;
  total_topics: number;
  status_counts: Record<string, number>;
  recent_entities: {
    id: number;
    external_id: string;
    name: string;
    entity_type: string;
    created_at: string;
  }[];
  recent_memories: {
    id: number;
    entity_id: number;
    entity_name: string;
    topic_id?: number | null;
    topic_name: string;
    claim: string;
    value: string;
    claim_type?: ClaimType;
    confidence: number;
    status: MemoryStatus;
    created_at: string;
  }[];
  topic_distribution: {
    name: string;
    count: number;
  }[];
}

export interface IntelResponse {
  entity_id: number;
  entity_name: string;
  entity_type: EntityType;
  formatted_prompt: string;
  memories: Memory[];
  total_memories: number;
  total_episodes: number;
}

export interface IngestResponse {
  episode_id: number;
  entity_id: number;
  memories_extracted: number;
  memories_updated: number;
  memories_new: number;
  idempotent_replay?: boolean;
  memories: Memory[];
}

export interface HealthInfo {
  status: string;
  version: string;
  llm_model?: string;
  database?: string;
}
