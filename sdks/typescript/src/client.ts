import type {
  ClueStateOptions,
  CreateEntityParams,
  CreateTopicParams,
  Entity,
  Episode,
  IngestParams,
  IngestResponse,
  IntelResponse,
  ListEntitiesParams,
  ListMemoriesParams,
  Memory,
  Topic,
  UpdateMemoryParams,
  UpdateTopicParams,
} from './types';

const DEFAULT_BASE_URL = 'https://app.cluestate.com';

export class ClueStateError extends Error {
  public readonly statusCode?: number;
  public readonly body?: unknown;

  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message);
    this.name = 'ClueStateError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function getEnvVar(name: string): string | undefined {
  try {
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env) {
      return proc.env[name];
    }
  } catch {
    // Ignore in browser/edge environments without process
  }
  return undefined;
}

export class EntitiesResource {
  constructor(private readonly client: ClueState) {}

  async create(params: CreateEntityParams): Promise<Entity> {
    const externalId = params.externalId ?? params.external_id;
    if (!externalId) {
      throw new Error("Provide 'externalId' when creating an entity");
    }
    return this.client._request<Entity>('POST', '/entities', {
      body: {
        external_id: externalId,
        name: params.name ?? '',
        entity_type: params.entityType ?? params.entity_type ?? 'person',
        meta: params.meta ?? {},
      },
    });
  }

  async list(params: ListEntitiesParams = {}): Promise<Entity[]> {
    return this.client._request<Entity[]>('GET', '/entities', {
      query: {
        search: params.search ?? '',
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    });
  }

  async get(entityId: number): Promise<Entity> {
    return this.client._request<Entity>('GET', `/entities/${entityId}`);
  }

  async episodes(entityId: number, limit: number = 50): Promise<Episode[]> {
    return this.client._request<Episode[]>('GET', `/entities/${entityId}/episodes`, {
      query: { limit },
    });
  }

  async delete(entityId: number): Promise<void> {
    await this.client._request<void>('DELETE', `/entities/${entityId}`);
  }
}

export class MemoriesResource {
  constructor(private readonly client: ClueState) {}

  async list(params: ListMemoriesParams): Promise<Memory[]> {
    return this.client._request<Memory[]>('GET', `/entities/${params.entityId}/memories`, {
      query: {
        status: params.status,
        topic_id: params.topicId,
      },
    });
  }

  async update(memoryId: number, params: UpdateMemoryParams): Promise<Memory> {
    return this.client._request<Memory>('PATCH', `/memories/${memoryId}`, {
      body: params,
    });
  }

  async confirm(memoryId: number): Promise<Memory> {
    return this.update(memoryId, { status: 'confirmed' });
  }

  async reject(memoryId: number): Promise<Memory> {
    return this.update(memoryId, { status: 'rejected' });
  }

  async delete(memoryId: number): Promise<void> {
    await this.client._request<void>('DELETE', `/memories/${memoryId}`);
  }
}

export class TopicsResource {
  constructor(private readonly client: ClueState) {}

  async create(params: CreateTopicParams): Promise<Topic> {
    return this.client._request<Topic>('POST', '/topics', {
      body: {
        name: params.name,
        description: params.description ?? '',
        data_type: params.dataType ?? params.data_type ?? 'text',
        cardinality: params.cardinality ?? 'multiple',
        update_policy: params.updatePolicy ?? params.update_policy ?? 'append',
        temporal: params.temporal ?? false,
        enum_values: params.enumValues ?? params.enum_values ?? [],
      },
    });
  }

  async list(activeOnly: boolean = true): Promise<Topic[]> {
    return this.client._request<Topic[]>('GET', '/topics', {
      query: { active_only: activeOnly },
    });
  }

  async update(topicId: number, params: UpdateTopicParams): Promise<Topic> {
    const body: Record<string, unknown> = {};
    if (params.description !== undefined) body.description = params.description;
    if (params.dataType ?? params.data_type) body.data_type = params.dataType ?? params.data_type;
    if (params.cardinality !== undefined) body.cardinality = params.cardinality;
    if (params.updatePolicy ?? params.update_policy) {
      body.update_policy = params.updatePolicy ?? params.update_policy;
    }
    if (params.temporal !== undefined) body.temporal = params.temporal;
    if (params.enumValues ?? params.enum_values) {
      body.enum_values = params.enumValues ?? params.enum_values;
    }
    if ((params.isActive ?? params.is_active) !== undefined) {
      body.is_active = params.isActive ?? params.is_active;
    }
    return this.client._request<Topic>('PUT', `/topics/${topicId}`, { body });
  }

  async delete(topicId: number): Promise<void> {
    await this.client._request<void>('DELETE', `/topics/${topicId}`);
  }
}

export class ClueState {
  public readonly apiKey: string;
  public readonly baseUrl: string;
  public readonly timeoutMs: number;
  private readonly _fetch: typeof fetch;

  public readonly entities: EntitiesResource;
  public readonly memories: MemoriesResource;
  public readonly topics: TopicsResource;

  constructor(options: ClueStateOptions = {}) {
    this.apiKey = options.apiKey ?? getEnvVar('CLUESTATE_API_KEY') ?? '';
    const rawUrl = options.baseUrl ?? getEnvVar('CLUESTATE_API_URL') ?? DEFAULT_BASE_URL;
    this.baseUrl = normalizeBaseUrl(rawUrl);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.entities = new EntitiesResource(this);
    this.memories = new MemoriesResource(this);
    this.topics = new TopicsResource(this);
  }

  /** @internal */
  async _request<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this._fetch(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = res.statusText || 'Request failed';
        let parsedBody: unknown = undefined;
        try {
          parsedBody = await res.json();
          if (
            parsedBody &&
            typeof parsedBody === 'object' &&
            'detail' in parsedBody &&
            (parsedBody as Record<string, unknown>).detail
          ) {
            const rawDetail = (parsedBody as Record<string, unknown>).detail;
            detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
          }
        } catch {
          // Keep statusText
        }
        throw new ClueStateError(detail, res.status, parsedBody);
      }

      if (res.status === 204) {
        return undefined as T;
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ingest an interaction and extract verified customer state claims.
   */
  async ingest(params: IngestParams): Promise<IngestResponse> {
    const externalId = params.externalId ?? params.external_id;
    const entityId = params.entityId ?? params.entity_id;

    if (!externalId && entityId === undefined) {
      throw new Error("Provide either 'externalId' or 'entityId'");
    }

    const occurredAtRaw = params.occurredAt ?? params.occurred_at;
    const occurredAt =
      occurredAtRaw instanceof Date ? occurredAtRaw.toISOString() : occurredAtRaw;

    const payload: Record<string, unknown> = {
      content: params.content,
      entity_name: params.entityName ?? params.entity_name ?? '',
      source_type: params.sourceType ?? params.source_type ?? 'conversation',
      source_description: params.sourceDescription ?? params.source_description ?? '',
      meta: params.meta ?? {},
      auto_create_entity: params.autoCreateEntity ?? params.auto_create_entity ?? true,
    };

    if (externalId !== undefined) payload.external_id = externalId;
    if (entityId !== undefined) payload.entity_id = entityId;
    if (params.sourceRecordId ?? params.source_record_id) {
      payload.source_record_id = params.sourceRecordId ?? params.source_record_id;
    }
    if (params.idempotencyKey ?? params.idempotency_key) {
      payload.idempotency_key = params.idempotencyKey ?? params.idempotency_key;
    }
    if (occurredAt !== undefined) payload.occurred_at = occurredAt;

    return this._request<IngestResponse>('POST', '/ingest', { body: payload });
  }

  /**
   * Retrieve compiled customer state by external ID (`string`) or options (`{ externalId }` / `{ entityId }`).
   */
  async getIntel(
    target: string | { externalId?: string; entityId?: number }
  ): Promise<IntelResponse> {
    if (typeof target === 'string') {
      return this._request<IntelResponse>(
        'GET',
        `/intel/by-external-id/${encodeURIComponent(target)}`
      );
    }
    if (target.externalId) {
      return this._request<IntelResponse>(
        'GET',
        `/intel/by-external-id/${encodeURIComponent(target.externalId)}`
      );
    }
    if (target.entityId !== undefined) {
      return this._request<IntelResponse>('GET', `/entities/${target.entityId}/intel`);
    }
    throw new Error("Provide either 'externalId' or 'entityId'");
  }
}

