import type {
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
} from './types';

const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const apiKey = localStorage.getItem('cluestate_api_key');
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
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

  if (!res.ok) {
    let errorDetail = `Request failed: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorDetail = typeof errorJson.detail === 'string'
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
  // Health
  getHealth: () => request<HealthInfo>('/health'),

  // Stats
  getStats: () => request<DashboardStats>('/stats'),

  // Entities
  listEntities: (search: string = '', limit: number = 50, offset: number = 0) =>
    request<Entity[]>(`/entities?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`),

  getEntity: (id: number) => request<Entity>(`/entities/${id}`),

  createEntity: (data: { external_id: string; name: string; entity_type: EntityType; meta?: Record<string, any> }) =>
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

  createTopic: (data: { name: string; description: string; data_type: string; enum_values?: string[] }) =>
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
