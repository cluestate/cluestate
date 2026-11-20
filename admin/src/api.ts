import type {
  ApiKeyCreated,
  ApiKeyItem,
  AuthResponse,
  DashboardStats,
  Entity,
  EntityType,
  Episode,
  ExtractionPolicy,
  HealthInfo,
  IngestResponse,
  IntelResponse,
  InviteInspectInfo,
  Memory,
  MemoryStatus,
  SourceType,
  SourceTypesResponse,
  Topic,
  TopicCardinality,
  TopicConstraints,
  UpdatePolicy,
  User,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from './types';

const API_BASE = '/api';

export const TOKEN_STORAGE_KEY = 'cluestate_token';
export const API_KEY_STORAGE_KEY = 'cluestate_api_key';
export const WORKSPACE_ID_STORAGE_KEY = 'cluestate_workspace_id';

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token =
    localStorage.getItem(TOKEN_STORAGE_KEY) ||
    localStorage.getItem(API_KEY_STORAGE_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const activeWsId = localStorage.getItem(WORKSPACE_ID_STORAGE_KEY);
  if (activeWsId && localStorage.getItem(TOKEN_STORAGE_KEY)) {
    headers['X-Workspace-Id'] = activeWsId;
  }
  return headers;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  if (
    res.status === 401 &&
    !endpoint.startsWith('/auth/login') &&
    !endpoint.startsWith('/auth/signup') &&
    !endpoint.startsWith('/auth/invites')
  ) {
    window.dispatchEvent(new CustomEvent('cluestate:unauthorized'));
  }

  if (!res.ok) {
    let errorDetail = `Request failed: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorDetail =
          typeof errorJson.detail === 'string'
            ? errorJson.detail
            : JSON.stringify(errorJson.detail);
      }
    } catch {
      // Keep default error text
    }
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Authentication & Session
  signup: (data: {
    email: string;
    password: string;
    full_name?: string;
    workspace_name?: string;
  }) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () =>
    request<{ user: User; workspace: Workspace; workspaces: Workspace[] }>('/auth/me'),

  inspectInvite: (token: string) =>
    request<InviteInspectInfo>(`/auth/invites/${encodeURIComponent(token)}`),

  acceptInvite: (
    token: string,
    data: { email?: string; full_name?: string; password?: string }
  ) =>
    request<AuthResponse>(`/auth/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Workspaces, Members & Invites
  listWorkspaces: () => request<Workspace[]>('/workspaces'),

  getCurrentWorkspace: () => request<Workspace>('/workspaces/current'),

  createWorkspace: (data: {
    name: string;
    clone_schema_from_workspace_id?: number | null;
  }) =>
    request<{ workspace: Workspace; initial_api_key: string }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWorkspace: (
    workspaceId: number,
    data: { name?: string; extraction_policy?: Partial<ExtractionPolicy> }
  ) =>
    request<Workspace>(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateCurrentWorkspacePolicy: (policy: Partial<ExtractionPolicy>) =>
    request<Workspace>('/workspaces/current/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  seedDemoWorkspace: (preset: 'clinical' | 'saas') =>
    request<{
      preset: string;
      topics_created: number;
      entities_created: number;
      memories_created: number;
    }>('/workspaces/current/seed-demo', {
      method: 'POST',
      body: JSON.stringify({ preset }),
    }),

  listWorkspaceMembers: (workspaceId: number) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),

  addWorkspaceMember: (
    workspaceId: number,
    data: { email: string; role: WorkspaceRole }
  ) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWorkspaceMemberRole: (
    workspaceId: number,
    memberId: number,
    role: WorkspaceRole
  ) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeWorkspaceMember: (workspaceId: number, memberId: number) =>
    request<void>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'DELETE',
    }),

  listWorkspaceInvites: (workspaceId: number) =>
    request<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`),

  createWorkspaceInvite: (
    workspaceId: number,
    data: { email?: string; role: WorkspaceRole; expires_in_days?: number }
  ) =>
    request<WorkspaceInvite>(`/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  revokeWorkspaceInvite: (workspaceId: number, inviteId: number) =>
    request<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
    }),

  // API Keys
  listApiKeys: () => request<ApiKeyItem[]>('/auth/api-keys'),

  createApiKey: (name: string) =>
    request<ApiKeyCreated>('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  revokeApiKey: (keyId: number) =>
    request<void>(`/auth/api-keys/${keyId}`, {
      method: 'DELETE',
    }),

  // Health & Stats
  getHealth: () => request<HealthInfo>('/health'),

  getStats: () => request<DashboardStats>('/stats'),

  // Entities
  listEntities: (
    search: string = '',
    limit: number = 50,
    offset: number = 0,
    where: string[] = []
  ) => {
    const q = new URLSearchParams();
    q.set('search', search);
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    for (const clause of where) {
      if (clause && clause.trim()) q.append('where', clause.trim());
    }
    return request<Entity[]>(`/entities?${q.toString()}`);
  },

  getEntity: (id: number) => request<Entity>(`/entities/${id}`),

  createEntity: (data: {
    external_id: string;
    name: string;
    entity_type: EntityType;
    meta?: Record<string, any>;
  }) =>
    request<Entity>('/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteEntity: (id: number) =>
    request<void>(`/entities/${id}`, {
      method: 'DELETE',
    }),

  getEntityEpisodes: (id: number, limit: number = 50) =>
    request<Episode[]>(`/entities/${id}/episodes?limit=${limit}`),

  deleteEpisode: (episodeId: number) =>
    request<void>(`/episodes/${episodeId}`, {
      method: 'DELETE',
    }),

  // Memories & Global Review Queue
  listWorkspaceMemories: (params: {
    status?: MemoryStatus;
    topicId?: number;
    entityId?: number;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.topicId !== undefined) q.set('topic_id', String(params.topicId));
    if (params.entityId !== undefined) q.set('entity_id', String(params.entityId));
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return request<Memory[]>(`/memories?${q.toString()}`);
  },

  getEntityMemories: (
    entityId: number,
    status?: MemoryStatus,
    topicId?: number,
    includeAll: boolean = false
  ) => {
    let url = `/entities/${entityId}/memories?`;
    if (status) url += `status=${status}&`;
    if (topicId) url += `topic_id=${topicId}&`;
    if (includeAll) url += `include_all=true&`;
    return request<Memory[]>(url);
  },

  updateMemory: (
    memoryId: number,
    data: {
      status?: MemoryStatus;
      confidence?: number;
      claim?: string;
      value?: string;
      topic_id?: number | null;
    }
  ) =>
    request<Memory>(`/memories/${memoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMemory: (memoryId: number) =>
    request<void>(`/memories/${memoryId}`, {
      method: 'DELETE',
    }),

  // Topics / Memory Schema Tags
  listTopics: (activeOnly: boolean = false) =>
    request<Topic[]>(`/topics?active_only=${activeOnly}`),

  createTopic: (data: {
    name: string;
    label?: string;
    description: string;
    extraction_instructions?: string;
    examples?: string[];
    data_type: string;
    cardinality?: TopicCardinality;
    update_policy?: UpdatePolicy;
    temporal?: boolean;
    ttl_days?: number | null;
    enum_values?: string[];
    allow_custom_values?: boolean;
    allow_inferred?: boolean;
    min_confidence?: number;
    constraints?: TopicConstraints;
    applies_to_entity_types?: string[];
  }) =>
    request<Topic>('/topics', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTopic: (id: number, data: Partial<Topic>) =>
    request<Topic>(`/topics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTopic: (id: number) =>
    request<void>(`/topics/${id}`, {
      method: 'DELETE',
    }),

  // Ingestion
  ingest: (data: {
    content: string;
    entity_id?: number;
    external_id?: string;
    entity_name?: string;
    source_type?: SourceType;
    source_record_id?: string;
    idempotency_key?: string;
    occurred_at?: string;
    source_description?: string;
    auto_create_entity?: boolean;
    dry_run?: boolean;
    meta?: Record<string, any>;
  }) =>
    request<IngestResponse>('/ingest', {
      method: 'POST',
      body: JSON.stringify({
        source_type: 'conversation',
        auto_create_entity: true,
        ...data,
      }),
    }),

  // Intel
  getEntityIntel: (entityId: number) =>
    request<IntelResponse>(`/entities/${entityId}/intel`),

  getIntelByExternalId: (externalId: string) =>
    request<IntelResponse>(`/intel/by-external-id/${encodeURIComponent(externalId)}`),

  // Source Types
  getSourceTypes: () => request<SourceTypesResponse>('/source-types'),

  addSourceType: (name: string) =>
    request<SourceTypesResponse>('/source-types', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteSourceType: (name: string) =>
    request<SourceTypesResponse>(`/source-types/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
};
