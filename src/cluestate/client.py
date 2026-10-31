"""Official ClueState Python SDK — Synchronous and Asynchronous Clients."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Optional, Union

import httpx

from .models import (
    EntityType,
    MemoryStatus,
    SourceType,
    TopicCardinality,
    UpdatePolicy,
)
from .schemas import (
    EntityDetail,
    EntityRead,
    EpisodeRead,
    IngestResponse,
    IntelResponse,
    MemoryRead,
    TopicRead,
)

DEFAULT_BASE_URL = "https://app.cluestate.com"


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


def _build_headers(api_key: str) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "cluestate-python/0.1.0",
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
# Synchronous Sub-Resources
# ──────────────────────────────────────────────

class EntitiesResource:
    def __init__(self, client: "ClueState"):
        self._client = client

    def create(
        self,
        external_id: str,
        name: str = "",
        entity_type: Union[EntityType, str] = EntityType.PERSON,
        meta: Optional[dict[str, Any]] = None,
    ) -> EntityRead:
        payload = {
            "external_id": external_id,
            "name": name,
            "entity_type": entity_type.value if isinstance(entity_type, EntityType) else entity_type,
            "meta": meta or {},
        }
        data = self._client._request("POST", "/entities", json=payload)
        return EntityRead.model_validate(data)

    def list(
        self,
        search: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> list[EntityRead]:
        params = {"search": search, "limit": limit, "offset": offset}
        data = self._client._request("GET", "/entities", params=params)
        return [EntityRead.model_validate(item) for item in data]

    def get(self, entity_id: int) -> EntityDetail:
        data = self._client._request("GET", f"/entities/{entity_id}")
        return EntityDetail.model_validate(data)

    def episodes(self, entity_id: int, limit: int = 50) -> list[EpisodeRead]:
        data = self._client._request("GET", f"/entities/{entity_id}/episodes", params={"limit": limit})
        return [EpisodeRead.model_validate(item) for item in data]

    def delete(self, entity_id: int) -> None:
        self._client._request("DELETE", f"/entities/{entity_id}")


class MemoriesResource:
    def __init__(self, client: "ClueState"):
        self._client = client

    def list(
        self,
        entity_id: int,
        status: Optional[Union[MemoryStatus, str]] = None,
        topic_id: Optional[int] = None,
    ) -> list[MemoryRead]:
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status.value if isinstance(status, MemoryStatus) else status
        if topic_id is not None:
            params["topic_id"] = topic_id
        data = self._client._request("GET", f"/entities/{entity_id}/memories", params=params)
        return [MemoryRead.model_validate(item) for item in data]

    def update(
        self,
        memory_id: int,
        status: Optional[Union[MemoryStatus, str]] = None,
        confidence: Optional[float] = None,
    ) -> MemoryRead:
        payload: dict[str, Any] = {}
        if status is not None:
            payload["status"] = status.value if isinstance(status, MemoryStatus) else status
        if confidence is not None:
            payload["confidence"] = confidence
        data = self._client._request("PATCH", f"/memories/{memory_id}", json=payload)
        return MemoryRead.model_validate(data)

    def confirm(self, memory_id: int) -> MemoryRead:
        return self.update(memory_id=memory_id, status=MemoryStatus.CONFIRMED)

    def reject(self, memory_id: int) -> MemoryRead:
        return self.update(memory_id=memory_id, status=MemoryStatus.REJECTED)

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
        cardinality: Union[TopicCardinality, str] = TopicCardinality.MULTIPLE,
        update_policy: Union[UpdatePolicy, str] = UpdatePolicy.APPEND,
        temporal: bool = False,
        enum_values: Optional[list[str]] = None,
    ) -> TopicRead:
        payload = {
            "name": name,
            "description": description,
            "data_type": data_type,
            "cardinality": cardinality.value if isinstance(cardinality, TopicCardinality) else cardinality,
            "update_policy": update_policy.value if isinstance(update_policy, UpdatePolicy) else update_policy,
            "temporal": temporal,
            "enum_values": enum_values or [],
        }
        data = self._client._request("POST", "/topics", json=payload)
        return TopicRead.model_validate(data)

    def list(self, active_only: bool = True) -> list[TopicRead]:
        data = self._client._request("GET", "/topics", params={"active_only": active_only})
        return [TopicRead.model_validate(item) for item in data]

    def update(
        self,
        topic_id: int,
        description: Optional[str] = None,
        data_type: Optional[str] = None,
        cardinality: Optional[Union[TopicCardinality, str]] = None,
        update_policy: Optional[Union[UpdatePolicy, str]] = None,
        temporal: Optional[bool] = None,
        enum_values: Optional[list[str]] = None,
        is_active: Optional[bool] = None,
    ) -> TopicRead:
        payload: dict[str, Any] = {}
        if description is not None:
            payload["description"] = description
        if data_type is not None:
            payload["data_type"] = data_type
        if cardinality is not None:
            payload["cardinality"] = cardinality.value if isinstance(cardinality, TopicCardinality) else cardinality
        if update_policy is not None:
            payload["update_policy"] = update_policy.value if isinstance(update_policy, UpdatePolicy) else update_policy
        if temporal is not None:
            payload["temporal"] = temporal
        if enum_values is not None:
            payload["enum_values"] = enum_values
        if is_active is not None:
            payload["is_active"] = is_active
        data = self._client._request("PUT", f"/topics/{topic_id}", json=payload)
        return TopicRead.model_validate(data)

    def delete(self, topic_id: int) -> None:
        self._client._request("DELETE", f"/topics/{topic_id}")


# ──────────────────────────────────────────────
# Synchronous ClueState Client
# ──────────────────────────────────────────────

class ClueState:
    """
    Synchronous ClueState SDK Client.

    Example:
        from cluestate import ClueState

        cs = ClueState(api_key="cs_live_...", base_url="https://app.cluestate.com")
        res = cs.ingest(
            external_id="cust_123",
            entity_name="Alice Chen",
            content="Alice upgraded to Enterprise and prefers Slack notifications.",
            source_type="conversation",
        )
        intel = cs.get_intel("cust_123")
        print(intel.formatted_prompt)
    """

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
        source_type: Union[SourceType, str] = SourceType.CONVERSATION,
        source_record_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        occurred_at: Optional[Union[datetime, str]] = None,
        source_description: str = "",
        meta: Optional[dict[str, Any]] = None,
        auto_create_entity: bool = True,
    ) -> IngestResponse:
        """Ingest an interaction and extract verified customer state claims."""
        if not external_id and not entity_id:
            raise ValueError("Provide either 'external_id' or 'entity_id'")

        payload: dict[str, Any] = {
            "content": content,
            "entity_name": entity_name,
            "source_type": source_type.value if isinstance(source_type, SourceType) else source_type,
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
        """Retrieve compiled customer state by external_id or internal entity_id."""
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
# Asynchronous Sub-Resources
# ──────────────────────────────────────────────

class AsyncEntitiesResource:
    def __init__(self, client: "AsyncClueState"):
        self._client = client

    async def create(
        self,
        external_id: str,
        name: str = "",
        entity_type: Union[EntityType, str] = EntityType.PERSON,
        meta: Optional[dict[str, Any]] = None,
    ) -> EntityRead:
        payload = {
            "external_id": external_id,
            "name": name,
            "entity_type": entity_type.value if isinstance(entity_type, EntityType) else entity_type,
            "meta": meta or {},
        }
        data = await self._client._request("POST", "/entities", json=payload)
        return EntityRead.model_validate(data)

    async def list(
        self,
        search: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> list[EntityRead]:
        params = {"search": search, "limit": limit, "offset": offset}
        data = await self._client._request("GET", "/entities", params=params)
        return [EntityRead.model_validate(item) for item in data]

    async def get(self, entity_id: int) -> EntityDetail:
        data = await self._client._request("GET", f"/entities/{entity_id}")
        return EntityDetail.model_validate(data)

    async def episodes(self, entity_id: int, limit: int = 50) -> list[EpisodeRead]:
        data = await self._client._request("GET", f"/entities/{entity_id}/episodes", params={"limit": limit})
        return [EpisodeRead.model_validate(item) for item in data]

    async def delete(self, entity_id: int) -> None:
        await self._client._request("DELETE", f"/entities/{entity_id}")


class AsyncMemoriesResource:
    def __init__(self, client: "AsyncClueState"):
        self._client = client

    async def list(
        self,
        entity_id: int,
        status: Optional[Union[MemoryStatus, str]] = None,
        topic_id: Optional[int] = None,
    ) -> list[MemoryRead]:
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status.value if isinstance(status, MemoryStatus) else status
        if topic_id is not None:
            params["topic_id"] = topic_id
        data = await self._client._request("GET", f"/entities/{entity_id}/memories", params=params)
        return [MemoryRead.model_validate(item) for item in data]

    async def update(
        self,
        memory_id: int,
        status: Optional[Union[MemoryStatus, str]] = None,
        confidence: Optional[float] = None,
    ) -> MemoryRead:
        payload: dict[str, Any] = {}
        if status is not None:
            payload["status"] = status.value if isinstance(status, MemoryStatus) else status
        if confidence is not None:
            payload["confidence"] = confidence
        data = await self._client._request("PATCH", f"/memories/{memory_id}", json=payload)
        return MemoryRead.model_validate(data)

    async def confirm(self, memory_id: int) -> MemoryRead:
        return await self.update(memory_id=memory_id, status=MemoryStatus.CONFIRMED)

    async def reject(self, memory_id: int) -> MemoryRead:
        return await self.update(memory_id=memory_id, status=MemoryStatus.REJECTED)

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
        cardinality: Union[TopicCardinality, str] = TopicCardinality.MULTIPLE,
        update_policy: Union[UpdatePolicy, str] = UpdatePolicy.APPEND,
        temporal: bool = False,
        enum_values: Optional[list[str]] = None,
    ) -> TopicRead:
        payload = {
            "name": name,
            "description": description,
            "data_type": data_type,
            "cardinality": cardinality.value if isinstance(cardinality, TopicCardinality) else cardinality,
            "update_policy": update_policy.value if isinstance(update_policy, UpdatePolicy) else update_policy,
            "temporal": temporal,
            "enum_values": enum_values or [],
        }
        data = await self._client._request("POST", "/topics", json=payload)
        return TopicRead.model_validate(data)

    async def list(self, active_only: bool = True) -> list[TopicRead]:
        data = await self._client._request("GET", "/topics", params={"active_only": active_only})
        return [TopicRead.model_validate(item) for item in data]

    async def update(
        self,
        topic_id: int,
        description: Optional[str] = None,
        data_type: Optional[str] = None,
        cardinality: Optional[Union[TopicCardinality, str]] = None,
        update_policy: Optional[Union[UpdatePolicy, str]] = None,
        temporal: Optional[bool] = None,
        enum_values: Optional[list[str]] = None,
        is_active: Optional[bool] = None,
    ) -> TopicRead:
        payload: dict[str, Any] = {}
        if description is not None:
            payload["description"] = description
        if data_type is not None:
            payload["data_type"] = data_type
        if cardinality is not None:
            payload["cardinality"] = cardinality.value if isinstance(cardinality, TopicCardinality) else cardinality
        if update_policy is not None:
            payload["update_policy"] = update_policy.value if isinstance(update_policy, UpdatePolicy) else update_policy
        if temporal is not None:
            payload["temporal"] = temporal
        if enum_values is not None:
            payload["enum_values"] = enum_values
        if is_active is not None:
            payload["is_active"] = is_active
        data = await self._client._request("PUT", f"/topics/{topic_id}", json=payload)
        return TopicRead.model_validate(data)

    async def delete(self, topic_id: int) -> None:
        await self._client._request("DELETE", f"/topics/{topic_id}")


# ──────────────────────────────────────────────
# Asynchronous ClueState Client
# ──────────────────────────────────────────────

class AsyncClueState:
    """
    Asynchronous ClueState SDK Client for asyncio / FastAPI applications.

    Example:
        from cluestate import AsyncClueState

        async with AsyncClueState(api_key="cs_live_...") as cs:
            res = await cs.ingest(external_id="cust_123", content="...")
            intel = await cs.get_intel("cust_123")
    """

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
        source_type: Union[SourceType, str] = SourceType.CONVERSATION,
        source_record_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        occurred_at: Optional[Union[datetime, str]] = None,
        source_description: str = "",
        meta: Optional[dict[str, Any]] = None,
        auto_create_entity: bool = True,
    ) -> IngestResponse:
        """Ingest an interaction asynchronously and extract verified customer state."""
        if not external_id and not entity_id:
            raise ValueError("Provide either 'external_id' or 'entity_id'")

        payload: dict[str, Any] = {
            "content": content,
            "entity_name": entity_name,
            "source_type": source_type.value if isinstance(source_type, SourceType) else source_type,
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
        """Retrieve compiled customer state asynchronously."""
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

