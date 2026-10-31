"""Standalone lightweight Python SDK for ClueState (depends only on httpx and pydantic)."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Literal, Optional, Union

import httpx
from pydantic import BaseModel, Field

DEFAULT_BASE_URL = "https://app.cluestate.com"

EntityTypeLiteral = Literal["person", "organization", "product", "location", "custom"]
MemoryStatusLiteral = Literal["active", "confirmed", "pending_review", "rejected", "superseded"]
ClaimTypeLiteral = Literal["explicit", "inferred", "observed"]
TopicCardinalityLiteral = Literal["single", "multiple"]
UpdatePolicyLiteral = Literal["replace", "append", "review"]
SourceTypeLiteral = Literal[
    "conversation",
    "email",
    "survey",
    "purchase",
    "support_ticket",
    "call_transcript",
    "app_interaction",
    "review",
    "social_media",
    "note",
    "custom",
]


class ClueStateError(Exception):
    """Raised when the ClueState API returns an error response."""

    def __init__(self, message: str, status_code: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.body = body

    def __str__(self) -> str:
        if self.status_code:
            return f"[HTTP {self.status_code}] {self.message}"
        return self.message


# ──────────────────────────────────────────────
# Response Models
# ──────────────────────────────────────────────

class Evidence(BaseModel):
    id: int
    episode_id: int
    excerpt: str
    is_verified: bool = False
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    content_hash: str = ""
    created_at: datetime


class Memory(BaseModel):
    id: int
    entity_id: int
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    claim: str
    value: str
    structured_value: Optional[Any] = None
    claim_type: str = "explicit"
    confidence: float
    status: str
    superseded_by_id: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    evidence: list[Evidence] = Field(default_factory=list)


class Entity(BaseModel):
    id: int
    external_id: str
    name: str
    entity_type: str
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    memory_count: int = 0
    memories: list[Memory] = Field(default_factory=list)


class Topic(BaseModel):
    id: int
    name: str
    description: str
    data_type: str
    cardinality: str = "multiple"
    update_policy: str = "append"
    temporal: bool = False
    enum_values: list[str] = Field(default_factory=list)
    schema_version: int = 1
    is_active: bool = True
    created_at: datetime


class Episode(BaseModel):
    id: int
    entity_id: int
    source_type: str
    source_record_id: Optional[str] = None
    content: str
    content_hash: str = ""
    source_description: str = ""
    meta: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime
    created_at: datetime


class IngestResponse(BaseModel):
    episode_id: int
    entity_id: int
    memories_extracted: int
    memories_updated: int
    memories_new: int
    idempotent_replay: bool = False
    memories: list[Memory] = Field(default_factory=list)


class IntelResponse(BaseModel):
    entity_id: int
    entity_name: str
    entity_type: str
    formatted_prompt: str
    memories: list[Memory] = Field(default_factory=list)
    total_memories: int = 0
    total_episodes: int = 0


def _build_headers(api_key: str) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "cluestate-sdk-python/0.1.0",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _normalize_base_url(base_url: str) -> str:
    url = base_url.rstrip("/")
    if not url.endswith("/api"):
        url = f"{url}/api"
    return url


def _raise_for_response(response: httpx.Response) -> None:
    if response.is_success:
        return
    detail = response.reason_phrase or "Request failed"
    body = None
    try:
        body = response.json()
        if isinstance(body, dict) and "detail" in body:
            detail = str(body["detail"])
    except Exception:
        detail = response.text or detail
    raise ClueStateError(message=detail, status_code=response.status_code, body=body)


# ──────────────────────────────────────────────
# Sync Resources & Client
# ──────────────────────────────────────────────

class EntitiesResource:
    def __init__(self, client: "ClueState"):
        self._client = client

    def create(
        self,
        external_id: str,
        name: str = "",
        entity_type: EntityTypeLiteral = "person",
        meta: Optional[dict[str, Any]] = None,
    ) -> Entity:
        data = self._client._request(
            "POST",
            "/entities",
            json={"external_id": external_id, "name": name, "entity_type": entity_type, "meta": meta or {}},
        )
        return Entity.model_validate(data)

    def list(self, search: str = "", limit: int = 50, offset: int = 0) -> list[Entity]:
        data = self._client._request("GET", "/entities", params={"search": search, "limit": limit, "offset": offset})
        return [Entity.model_validate(item) for item in data]

    def get(self, entity_id: int) -> Entity:
        data = self._client._request("GET", f"/entities/{entity_id}")
        return Entity.model_validate(data)

    def episodes(self, entity_id: int, limit: int = 50) -> list[Episode]:
        data = self._client._request("GET", f"/entities/{entity_id}/episodes", params={"limit": limit})
        return [Episode.model_validate(item) for item in data]

    def delete(self, entity_id: int) -> None:
        self._client._request("DELETE", f"/entities/{entity_id}")


class MemoriesResource:
    def __init__(self, client: "ClueState"):
        self._client = client

    def list(
        self,
        entity_id: int,
        status: Optional[MemoryStatusLiteral] = None,
        topic_id: Optional[int] = None,
    ) -> list[Memory]:
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if topic_id is not None:
            params["topic_id"] = topic_id
        data = self._client._request("GET", f"/entities/{entity_id}/memories", params=params)
        return [Memory.model_validate(item) for item in data]

    def update(
        self,
        memory_id: int,
        status: Optional[MemoryStatusLiteral] = None,
        confidence: Optional[float] = None,
    ) -> Memory:
        payload: dict[str, Any] = {}
        if status is not None:
            payload["status"] = status
        if confidence is not None:
            payload["confidence"] = confidence
        data = self._client._request("PATCH", f"/memories/{memory_id}", json=payload)
        return Memory.model_validate(data)

    def confirm(self, memory_id: int) -> Memory:
        return self.update(memory_id=memory_id, status="confirmed")

    def reject(self, memory_id: int) -> Memory:
        return self.update(memory_id=memory_id, status="rejected")

    def delete(self, memory_id: int) -> None:
        self._client._request("DELETE", f"/memories/{memory_id}")


class TopicsResource:
    def __init__(self, client: "ClueState"):
        self._client = client

    def create(
        self,
        name: str,
        description: str = "",
        data_type: str = "text",
        cardinality: TopicCardinalityLiteral = "multiple",
        update_policy: UpdatePolicyLiteral = "append",
        temporal: bool = False,
        enum_values: Optional[list[str]] = None,
    ) -> Topic:
        data = self._client._request(
            "POST",
            "/topics",
            json={
                "name": name,
                "description": description,
                "data_type": data_type,
                "cardinality": cardinality,
                "update_policy": update_policy,
                "temporal": temporal,
                "enum_values": enum_values or [],
            },
        )
        return Topic.model_validate(data)

    def list(self, active_only: bool = True) -> list[Topic]:
        data = self._client._request("GET", "/topics", params={"active_only": active_only})
        return [Topic.model_validate(item) for item in data]

    def update(self, topic_id: int, **kwargs: Any) -> Topic:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        data = self._client._request("PUT", f"/topics/{topic_id}", json=payload)
        return Topic.model_validate(data)

    def delete(self, topic_id: int) -> None:
        self._client._request("DELETE", f"/topics/{topic_id}")


class ClueState:
    """Synchronous ClueState SDK Client."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        http_client: Optional[httpx.Client] = None,
    ):
        self.api_key = api_key if api_key is not None else os.getenv("CLUESTATE_API_KEY", "")
        raw_url = base_url or os.getenv("CLUESTATE_API_URL") or DEFAULT_BASE_URL
        self.base_url = _normalize_base_url(raw_url)
        self._owns_client = http_client is None
        self._http = http_client or httpx.Client(
            base_url=self.base_url,
            headers=_build_headers(self.api_key),
            timeout=timeout,
        )
        self.entities = EntitiesResource(self)
        self.memories = MemoriesResource(self)
        self.topics = TopicsResource(self)

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
    ) -> Any:
        res = self._http.request(method, path, params=params, json=json)
        _raise_for_response(res)
        if res.status_code == 204 or not res.content:
            return None
        return res.json()

    def ingest(
        self,
        content: str,
        *,
        external_id: Optional[str] = None,
        entity_id: Optional[int] = None,
        entity_name: str = "",
        source_type: SourceTypeLiteral = "conversation",
        source_record_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        occurred_at: Optional[Union[datetime, str]] = None,
        source_description: str = "",
        meta: Optional[dict[str, Any]] = None,
        auto_create_entity: bool = True,
    ) -> IngestResponse:
        if not external_id and not entity_id:
            raise ValueError("Provide either 'external_id' or 'entity_id'")

        payload: dict[str, Any] = {
            "content": content,
            "entity_name": entity_name,
            "source_type": source_type,
            "source_description": source_description,
            "meta": meta or {},
            "auto_create_entity": auto_create_entity,
        }
        if external_id is not None:
            payload["external_id"] = external_id
        if entity_id is not None:
            payload["entity_id"] = entity_id
        if source_record_id is not None:
            payload["source_record_id"] = source_record_id
        if idempotency_key is not None:
            payload["idempotency_key"] = idempotency_key
        if occurred_at is not None:
            payload["occurred_at"] = (
                occurred_at.isoformat() if isinstance(occurred_at, datetime) else occurred_at
            )

        data = self._request("POST", "/ingest", json=payload)
        return IngestResponse.model_validate(data)

    def get_intel(
        self,
        external_id: Optional[str] = None,
        *,
        entity_id: Optional[int] = None,
    ) -> IntelResponse:
        if external_id:
            data = self._request("GET", f"/intel/by-external-id/{external_id}")
        elif entity_id is not None:
            data = self._request("GET", f"/entities/{entity_id}/intel")
        else:
            raise ValueError("Provide either 'external_id' or 'entity_id'")
        return IntelResponse.model_validate(data)

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> "ClueState":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


# ──────────────────────────────────────────────
# Async Resources & Client
# ──────────────────────────────────────────────

class AsyncEntitiesResource:
    def __init__(self, client: "AsyncClueState"):
        self._client = client

    async def create(
        self,
        external_id: str,
        name: str = "",
        entity_type: EntityTypeLiteral = "person",
        meta: Optional[dict[str, Any]] = None,
    ) -> Entity:
        data = await self._client._request(
            "POST",
            "/entities",
            json={"external_id": external_id, "name": name, "entity_type": entity_type, "meta": meta or {}},
        )
        return Entity.model_validate(data)

    async def list(self, search: str = "", limit: int = 50, offset: int = 0) -> list[Entity]:
        data = await self._client._request("GET", "/entities", params={"search": search, "limit": limit, "offset": offset})
        return [Entity.model_validate(item) for item in data]

    async def get(self, entity_id: int) -> Entity:
        data = await self._client._request("GET", f"/entities/{entity_id}")
        return Entity.model_validate(data)

    async def episodes(self, entity_id: int, limit: int = 50) -> list[Episode]:
        data = await self._client._request("GET", f"/entities/{entity_id}/episodes", params={"limit": limit})
        return [Episode.model_validate(item) for item in data]

    async def delete(self, entity_id: int) -> None:
        await self._client._request("DELETE", f"/entities/{entity_id}")


class AsyncMemoriesResource:
    def __init__(self, client: "AsyncClueState"):
        self._client = client

    async def list(
        self,
        entity_id: int,
        status: Optional[MemoryStatusLiteral] = None,
        topic_id: Optional[int] = None,
    ) -> list[Memory]:
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if topic_id is not None:
            params["topic_id"] = topic_id
        data = await self._client._request("GET", f"/entities/{entity_id}/memories", params=params)
        return [Memory.model_validate(item) for item in data]

    async def update(
        self,
        memory_id: int,
        status: Optional[MemoryStatusLiteral] = None,
        confidence: Optional[float] = None,
    ) -> Memory:
        payload: dict[str, Any] = {}
        if status is not None:
            payload["status"] = status
        if confidence is not None:
            payload["confidence"] = confidence
        data = await self._client._request("PATCH", f"/memories/{memory_id}", json=payload)
        return Memory.model_validate(data)

    async def confirm(self, memory_id: int) -> Memory:
        return await self.update(memory_id=memory_id, status="confirmed")

    async def reject(self, memory_id: int) -> Memory:
        return await self.update(memory_id=memory_id, status="rejected")

    async def delete(self, memory_id: int) -> None:
        await self._client._request("DELETE", f"/memories/{memory_id}")


class AsyncTopicsResource:
    def __init__(self, client: "AsyncClueState"):
        self._client = client

    async def create(
        self,
        name: str,
        description: str = "",
        data_type: str = "text",
        cardinality: TopicCardinalityLiteral = "multiple",
        update_policy: UpdatePolicyLiteral = "append",
        temporal: bool = False,
        enum_values: Optional[list[str]] = None,
    ) -> Topic:
        data = await self._client._request(
            "POST",
            "/topics",
            json={
                "name": name,
                "description": description,
                "data_type": data_type,
                "cardinality": cardinality,
                "update_policy": update_policy,
                "temporal": temporal,
                "enum_values": enum_values or [],
            },
        )
        return Topic.model_validate(data)

    async def list(self, active_only: bool = True) -> list[Topic]:
        data = await self._client._request("GET", "/topics", params={"active_only": active_only})
        return [Topic.model_validate(item) for item in data]

    async def update(self, topic_id: int, **kwargs: Any) -> Topic:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        data = await self._client._request("PUT", f"/topics/{topic_id}", json=payload)
        return Topic.model_validate(data)

    async def delete(self, topic_id: int) -> None:
        await self._client._request("DELETE", f"/topics/{topic_id}")


class AsyncClueState:
    """Asynchronous ClueState SDK Client."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key if api_key is not None else os.getenv("CLUESTATE_API_KEY", "")
        raw_url = base_url or os.getenv("CLUESTATE_API_URL") or DEFAULT_BASE_URL
        self.base_url = _normalize_base_url(raw_url)
        self._owns_client = http_client is None
        self._http = http_client or httpx.AsyncClient(
            base_url=self.base_url,
            headers=_build_headers(self.api_key),
            timeout=timeout,
        )
        self.entities = AsyncEntitiesResource(self)
        self.memories = AsyncMemoriesResource(self)
        self.topics = AsyncTopicsResource(self)

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
    ) -> Any:
        res = await self._http.request(method, path, params=params, json=json)
        _raise_for_response(res)
        if res.status_code == 204 or not res.content:
            return None
        return res.json()

    async def ingest(
        self,
        content: str,
        *,
        external_id: Optional[str] = None,
        entity_id: Optional[int] = None,
        entity_name: str = "",
        source_type: SourceTypeLiteral = "conversation",
        source_record_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        occurred_at: Optional[Union[datetime, str]] = None,
        source_description: str = "",
        meta: Optional[dict[str, Any]] = None,
        auto_create_entity: bool = True,
    ) -> IngestResponse:
        if not external_id and not entity_id:
            raise ValueError("Provide either 'external_id' or 'entity_id'")

        payload: dict[str, Any] = {
            "content": content,
            "entity_name": entity_name,
            "source_type": source_type,
            "source_description": source_description,
            "meta": meta or {},
            "auto_create_entity": auto_create_entity,
        }
        if external_id is not None:
            payload["external_id"] = external_id
        if entity_id is not None:
            payload["entity_id"] = entity_id
        if source_record_id is not None:
            payload["source_record_id"] = source_record_id
        if idempotency_key is not None:
            payload["idempotency_key"] = idempotency_key
        if occurred_at is not None:
            payload["occurred_at"] = (
                occurred_at.isoformat() if isinstance(occurred_at, datetime) else occurred_at
            )

        data = await self._request("POST", "/ingest", json=payload)
        return IngestResponse.model_validate(data)

    async def get_intel(
        self,
        external_id: Optional[str] = None,
        *,
        entity_id: Optional[int] = None,
    ) -> IntelResponse:
        if external_id:
            data = await self._request("GET", f"/intel/by-external-id/{external_id}")
        elif entity_id is not None:
            data = await self._request("GET", f"/entities/{entity_id}/intel")
        else:
            raise ValueError("Provide either 'external_id' or 'entity_id'")
        return IntelResponse.model_validate(data)

    async def close(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def __aenter__(self) -> "AsyncClueState":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()


__all__ = [
    "ClueState",
    "AsyncClueState",
    "ClueStateError",
    "Entity",
    "Memory",
    "Evidence",
    "Topic",
    "Episode",
    "IngestResponse",
    "IntelResponse",
]

