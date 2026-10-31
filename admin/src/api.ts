import type {
  ApiKeyCreated,
  ApiKeyItem,
  AuthResponse,
  DashboardStats,
  Entity,
  EntityType,
  Episode,
  HealthInfo,
  IngestResponse,
  IntelResponse,
  Memory,
  MemoryStatus,
  SourceType,
  Topic,
  TopicCardinality,
  UpdatePolicy,
  User,
  Workspace,
} from './types';

const API_BASE = '/api';

export const TOKEN_STORAGE_KEY = 'cluestate_token';
export const API_KEY_STORAGE_KEY = 'cluestate_api_key';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const token =
    localStorage.getItem(TOKEN_STORAGE_KEY) ||
    localStorage.getItem(API_KEY_STORAGE_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

  if (res.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/signup')) {
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
  // Authentication & Workspace
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

  getMe: () => request<{ user: User; workspace: Workspace }>('/auth/me'),

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

  // Health
  getHealth: () => request<HealthInfo>('/health'),

  // Stats
  getStats: () => request<DashboardStats>('/stats'),

  // Entities
  listEntities: (search: string = '', limit: number = 50, offset: number = 0) =>
    request<Entity[]>(
      `/entities?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`
    ),

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

  // Memories
  getEntityMemories: (entityId: number, status?: MemoryStatus, topicId?: number) => {
    let url = `/entities/${entityId}/memories?`;
    if (status) url += `status=${status}&`;
    if (topicId) url += `topic_id=${topicId}&`;
    return request<Memory[]>(url);
  },

  updateMemory: (memoryId: number, data: { status?: MemoryStatus; confidence?: number }) =>
    request<Memory>(`/memories/${memoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMemory: (memoryId: number) =>
    request<void>(`/memories/${memoryId}`, {
      method: 'DELETE',
    }),

  // Topics
  listTopics: (activeOnly: boolean = false) =>
    request<Topic[]>(`/topics?active_only=${activeOnly}`),

  createTopic: (data: {
    name: string;
    description: string;
    data_type: string;
    cardinality?: TopicCardinality;
    update_policy?: UpdatePolicy;
    temporal?: boolean;
    enum_values?: string[];
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
    meta?: Record<string, any>;
  }) =>
    request<IngestResponse>('/ingest', {
      method: 'POST',
      body: JSON.stringify({
        source_type: 'custom',
        auto_create_entity: true,
        ...data,
      }),
    }),

  // Intel
  getEntityIntel: (entityId: number) =>
    request<IntelResponse>(`/entities/${entityId}/intel`),

  getIntelByExternalId: (externalId: string) =>
    request<IntelResponse>(`/intel/by-external-id/${encodeURIComponent(externalId)}`),
};
