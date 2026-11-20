export type EntityType = 'person' | 'organization' | 'product' | 'location' | 'custom';

export type MemoryStatus = 'active' | 'confirmed' | 'pending_review' | 'rejected' | 'superseded';

export type ClaimType = 'explicit' | 'inferred' | 'observed';

export type TopicCardinality = 'single' | 'multiple';

export type UpdatePolicy = 'replace' | 'append' | 'review';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type DiscoveryMode = 'strict' | 'guided' | 'open';

export type JudgeMode = 'off' | 'smart' | 'always';

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

export interface ExtractionPolicy {
  discovery_mode: DiscoveryMode;
  discovery_instructions: string;
  discovery_review_policy: 'active' | 'pending_review';
  discovery_allow_inferred: boolean;
  discovery_max_per_episode: number;
  judge_mode?: JudgeMode;
  judge_model?: string;
}

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
  owner_id?: number | null;
  role?: WorkspaceRole | null;
  extraction_policy?: ExtractionPolicy;
  source_types?: string[];
  created_at: string;
}

export interface WorkspaceMember {
  id: number;
  workspace_id: number;
  user_id: number;
  email: string;
  full_name: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface WorkspaceInvite {
  id: number;
  workspace_id: number;
  workspace_name: string;
  token: string;
  email: string;
  role: WorkspaceRole;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
}

export interface InviteInspectInfo {
  token: string;
  workspace_id: number;
  workspace_name: string;
  workspace_slug: string;
  email: string;
  role: WorkspaceRole;
  expires_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  workspace: Workspace;
  workspaces?: Workspace[];
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

export interface Attachment {
  id: number;
  episode_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256?: string;
  has_file: boolean;
  download_url?: string | null;
  created_at: string;
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
  episode_content?: string | null;
  episode_source_type?: string | null;
  episode_description?: string | null;
  episode_occurred_at?: string | null;
  episode_attachments?: Attachment[];
}

export interface Memory {
  id: number;
  entity_id: number;
  entity_name?: string | null;
  entity_external_id?: string | null;
  topic_id?: number | null;
  topic_name?: string | null;
  claim: string;
  value: string;
  structured_value?: any;
  claim_type: ClaimType;
  confidence: number;
  status: MemoryStatus;
  judge_note?: string | null;
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
  state?: Record<string, any>;
}

export interface TopicConstraints {
  unit?: string;
  min?: number | null;
  max?: number | null;
}

export interface Topic {
  id: number;
  name: string;
  label?: string;
  description: string;
  extraction_instructions?: string;
  examples?: string[];
  data_type: string;
  cardinality: TopicCardinality;
  update_policy: UpdatePolicy;
  temporal: boolean;
  ttl_days?: number | null;
  enum_values: string[];
  allow_custom_values?: boolean;
  allow_inferred?: boolean;
  min_confidence?: number;
  constraints?: TopicConstraints;
  applies_to_entity_types?: string[];
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
  attachments?: Attachment[];
}

export interface SystemInfo {
  version: string;
  llm_model: string;
  judge_model?: string;
  vision_model?: string;
  database: string;
}

export interface IngestJob {
  id: number;
  workspace_id: number;
  entity_id: number;
  episode_id: number;
  entity_name?: string | null;
  entity_external_id?: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error?: string | null;
  result_summary?: Record<string, any>;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WorkspaceUsage {
  ingests_this_month: number;
  monthly_ingest_limit: number;
  rate_limit_per_min: number;
}

export interface DashboardStats {
  total_entities: number;
  total_memories: number;
  active_memories: number;
  pending_review_memories?: number;
  total_episodes: number;
  total_topics: number;
  status_counts: Record<string, number>;
  queue_counts?: {
    queued: number;
    processing: number;
    failed: number;
    completed: number;
  };
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
    entity_external_id?: string;
    topic_id?: number | null;
    topic_name: string;
    claim: string;
    value: string;
    structured_value?: any;
    claim_type?: ClaimType;
    confidence: number;
    status: MemoryStatus;
    is_verified?: boolean;
    char_start?: number | null;
    char_end?: number | null;
    excerpt?: string;
    created_at: string;
  }[];
  topic_distribution: {
    name: string;
    label?: string;
    data_type?: string;
    count: number;
  }[];
  extraction_policy?: ExtractionPolicy;
  usage?: WorkspaceUsage;
  system_info?: SystemInfo;
}

export interface JudgeRejectedItem {
  claim: string;
  topic_name?: string | null;
  value: string;
  reason: string;
}

export interface IntelResponse {
  entity_id: number;
  entity_name: string;
  entity_type: EntityType;
  formatted_prompt: string;
  state: Record<string, any>;
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
  dry_run?: boolean;
  job_id?: number | null;
  job_status?: string | null;
  judge_applied?: boolean;
  judge_rejected?: JudgeRejectedItem[];
  state?: Record<string, any>;
  memories: Memory[];
}

export interface HealthInfo {
  status: string;
  version: string;
  llm_model?: string;
  database?: string;
}
