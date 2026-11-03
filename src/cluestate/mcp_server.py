"""Model Context Protocol (MCP) server for ClueState.

Enables MCP-compatible clients (Claude Desktop, Cursor, Zed, Windsurf, custom agents)
to ingest, query, and manage verified customer and entity state locally or via remote API.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

# Support both mcp 2.x (MCPServer) and mcp 1.x (FastMCP)
try:
    from mcp.server.mcpserver import MCPServer
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP as MCPServer
    except ImportError:
        MCPServer = None


def _auth_headers(api_key: str) -> dict[str, str]:
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    return {}


def create_mcp_server() -> "MCPServer":
    if MCPServer is None:
        raise RuntimeError(
            "The 'mcp' package is not installed. Install it with: pip install mcp"
        )

    server = MCPServer(
        name="cluestate",
        description="Customer Intelligence & Entity State Engine with verified source evidence.",
    )

    api_url = os.getenv("CLUESTATE_API_URL", "").rstrip("/")
    api_key = os.getenv("CLUESTATE_API_KEY", "")
    workspace_id = int(os.getenv("CLUESTATE_WORKSPACE_ID", "1"))

    # ─────────────────────────────────────────────────────────────
    # Tool 1: Ingest Interaction
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_ingest",
        description=(
            "Ingest an interaction, note, or transcript about an entity and extract structured claims "
            "with verified source evidence and state resolution."
        ),
    )
    async def ingest_memory(
        external_id: str,
        content: str,
        entity_name: str = "",
        source_type: str = "conversation",
        source_description: str = "MCP Agent Session",
    ) -> str:
        if api_url:
            import httpx

            async with httpx.AsyncClient(base_url=api_url, timeout=60.0) as client:
                res = await client.post(
                    "/api/ingest",
                    headers=_auth_headers(api_key),
                    json={
                        "external_id": external_id,
                        "entity_name": entity_name or external_id,
                        "content": content,
                        "source_type": source_type,
                        "source_description": source_description,
                        "auto_create_entity": True,
                    },
                )
                if not res.is_success:
                    return f"Error ingesting interaction: {res.text}"
                data = res.json()
                memories = data.get("memories", [])
                if not memories:
                    return f"Recorded episode #{data.get('episode_id')} for '{external_id}', 0 claims extracted."

                lines = [
                    f"Extracted {len(memories)} claim(s) for '{entity_name or external_id}' "
                    f"(new: {data.get('memories_new', 0)}, updated: {data.get('memories_updated', 0)}):"
                ]
                for m in memories:
                    conf = int(m.get("confidence", 0.5) * 100)
                    topic = m.get("topic_name") or "general"
                    lines.append(f"• [{topic}] {m.get('claim')} ({conf}% confidence)")
                return "\n".join(lines)

        from sqlalchemy import select

        from .database import get_session_factory, init_db
        from .engine import (
            ExtractionError,
            compute_content_hash,
            extract_memories_from_text,
            process_extracted_claims,
        )
        from .models import (
            Entity,
            EntityType,
            Episode,
            Memory,
            MemoryStatus,
            Topic,
            Workspace,
            ensure_workspace_source_type,
            normalize_source_type,
        )

        await init_db()

        async with get_session_factory()() as session:
            workspace = await session.get(Workspace, workspace_id)
            if not workspace:
                from .database import ensure_default_workspace
                workspace = await ensure_default_workspace(session)

            st = normalize_source_type(source_type)
            await ensure_workspace_source_type(workspace, st, session)

            res = await session.execute(
                select(Entity).where(
                    Entity.workspace_id == workspace_id,
                    Entity.external_id == external_id,
                )
            )
            entity = res.scalars().first()
            if not entity:
                entity = Entity(
                    workspace_id=workspace_id,
                    external_id=external_id,
                    name=entity_name or external_id,
                    entity_type=EntityType.PERSON,
                )
                session.add(entity)
                await session.flush()

            now = datetime.now(timezone.utc)
            episode = Episode(
                workspace_id=workspace_id,
                entity_id=entity.id,
                source_type=st,
                content=content,
                content_hash=compute_content_hash(content),
                source_description=source_description,
                occurred_at=now,
                created_at=now,
            )
            session.add(episode)
            await session.flush()

            res_mem = await session.execute(
                select(Memory).where(
                    Memory.entity_id == entity.id,
                    Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
                )
            )
            existing_memories = list(res_mem.scalars().all())

            res_topics = await session.execute(
                select(Topic).where(
                    Topic.workspace_id == workspace_id,
                    Topic.is_active == True,
                )
            )
            topics = list(res_topics.scalars().all())

            try:
                extraction = await extract_memories_from_text(
                    content=content,
                    entity_name=entity.name or entity.external_id,
                    existing_memories=existing_memories,
                    topics=topics,
                )
            except ExtractionError as exc:
                await session.rollback()
                return f"Error during LLM extraction: {exc}"

            all_memories, new_count, updated_count = await process_extracted_claims(
                session=session,
                entity=entity,
                episode=episode,
                extraction=extraction,
                topics=topics,
            )
            await session.commit()

            if not all_memories:
                return f"Recorded episode #{episode.id} for '{entity.name}', 0 claims extracted."

            topic_map = {t.id: t.name for t in topics}
            lines = [
                f"Extracted {len(all_memories)} claim(s) for '{entity.name}' "
                f"(new: {new_count}, updated: {updated_count}):"
            ]
            for m in all_memories:
                t_name = topic_map.get(m.topic_id, "general") if m.topic_id else "general"
                conf = int(m.confidence * 100)
                lines.append(f"• [{t_name}] {m.claim} ({conf}% confidence)")

            return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool 2: Get Entity State / Intel
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_get_intel",
        description="Retrieve structured markdown customer state block for an entity by external_id.",
    )
    async def get_entity_intel(external_id: str) -> str:
        if api_url:
            import httpx

            async with httpx.AsyncClient(base_url=api_url, timeout=30.0) as client:
                res = await client.get(
                    f"/api/intel/by-external-id/{external_id}",
                    headers=_auth_headers(api_key),
                )
                if res.status_code == 404:
                    return f"No profile found for entity '{external_id}'."
                if not res.is_success:
                    return f"Error retrieving state: {res.text}"
                return res.json().get("formatted_prompt", "No claims recorded.")

        from sqlalchemy import select

        from .database import get_session_factory, init_db
        from .engine import format_entity_intel
        from .models import Entity

        await init_db()

        async with get_session_factory()() as session:
            res = await session.execute(
                select(Entity).where(
                    Entity.workspace_id == workspace_id,
                    Entity.external_id == external_id,
                )
            )
            entity = res.scalars().first()
            if not entity:
                return f"No profile found for entity '{external_id}'."

            intel_text = await format_entity_intel(session, entity)
            return intel_text or f"Entity '{external_id}' is tracked, but has 0 active claims."

    # ─────────────────────────────────────────────────────────────
    # Tool 3: List Memories with Evidence
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_list_memories",
        description="List atomic claims for an entity with confidence scores, topics, and verified source quotes.",
    )
    async def list_memories(
        external_id: str,
        topic: str = "",
        status: str = "active",
    ) -> str:
        if api_url:
            import httpx

            async with httpx.AsyncClient(base_url=api_url, timeout=30.0) as client:
                ent_res = await client.get(
                    "/api/entities",
                    params={"search": external_id, "limit": 20},
                    headers=_auth_headers(api_key),
                )
                if not ent_res.is_success:
                    return f"Error searching entity: {ent_res.text}"
                entities = ent_res.json()
                entity_obj = next((e for e in entities if e.get("external_id") == external_id), None)
                if not entity_obj:
                    return f"Entity '{external_id}' not found."

                params = {}
                if status and status != "all":
                    params["status"] = status.lower()
                mem_res = await client.get(
                    f"/api/entities/{entity_obj['id']}/memories",
                    params=params,
                    headers=_auth_headers(api_key),
                )
                if not mem_res.is_success:
                    return f"Error fetching memories: {mem_res.text}"
                memories = mem_res.json()
                if topic:
                    memories = [
                        m for m in memories
                        if (m.get("topic_name") or "").lower() == topic.lower()
                    ]
                if not memories:
                    return f"No claims found for '{external_id}'."

                lines = [f"Found {len(memories)} claim(s) for '{entity_obj.get('name') or external_id}':\n"]
                for m in memories:
                    t_name = m.get("topic_name") or "General"
                    conf = int(m.get("confidence", 0.5) * 100)
                    lines.append(f"• [ID: {m['id']}] [{t_name}] {m['claim']} ({conf}% conf, {m['status']})")
                    for ev in m.get("evidence", []):
                        v_tag = "verified" if ev.get("is_verified") else "unverified"
                        lines.append(f'    Quote ({v_tag}): "{ev.get("excerpt", "")}"')
                return "\n".join(lines)

        from sqlalchemy import select

        from .database import get_session_factory, init_db
        from .models import Entity, Evidence, Memory, MemoryStatus, Topic

        await init_db()

        async with get_session_factory()() as session:
            res_ent = await session.execute(
                select(Entity).where(
                    Entity.workspace_id == workspace_id,
                    Entity.external_id == external_id,
                )
            )
            entity = res_ent.scalars().first()
            if not entity:
                return f"Entity '{external_id}' not found."

            query = select(Memory).where(Memory.entity_id == entity.id)
            if status != "all":
                try:
                    query = query.where(Memory.status == MemoryStatus(status.lower()))
                except ValueError:
                    query = query.where(Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]))

            query = query.order_by(Memory.confidence.desc())
            res_mem = await session.execute(query)
            memories = res_mem.scalars().all()

            if not memories:
                return f"No claims found matching status '{status}' for '{external_id}'."

            lines = [f"Found {len(memories)} claim(s) for '{entity.name or external_id}':\n"]
            for m in memories:
                topic_name = "General"
                if m.topic_id:
                    top = await session.get(Topic, m.topic_id)
                    if top:
                        topic_name = top.name

                if topic and topic.lower() != topic_name.lower():
                    continue

                conf = int(m.confidence * 100)
                status_val = m.status.value if hasattr(m.status, "value") else str(m.status)
                lines.append(f"• [ID: {m.id}] [{topic_name}] {m.claim} ({conf}% conf, {status_val})")

                ev_res = await session.execute(
                    select(Evidence).where(Evidence.memory_id == m.id)
                )
                for ev in ev_res.scalars().all():
                    v_tag = "verified" if ev.is_verified else "unverified"
                    lines.append(f'    Quote ({v_tag}): "{ev.excerpt}"')

            return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool 4: Search Entities
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_search_entities",
        description="Search tracked entities by name or external ID.",
    )
    async def search_entities(query: str = "", limit: int = 10) -> str:
        if api_url:
            import httpx

            async with httpx.AsyncClient(base_url=api_url, timeout=30.0) as client:
                res = await client.get(
                    "/api/entities",
                    params={"search": query, "limit": limit},
                    headers=_auth_headers(api_key),
                )
                if not res.is_success:
                    return f"Error searching entities: {res.text}"
                entities = res.json()
                if not entities:
                    return f"No entities found matching '{query}'."
                lines = [f"Found {len(entities)} entities:"]
                for e in entities:
                    lines.append(
                        f"• {e.get('name')} (External ID: `{e.get('external_id')}`) | "
                        f"Type: {e.get('entity_type')} | Active Claims: {e.get('memory_count', 0)}"
                    )
                return "\n".join(lines)

        from sqlalchemy import func, select

        from .database import get_session_factory, init_db
        from .models import Entity, Memory, MemoryStatus

        await init_db()

        async with get_session_factory()() as session:
            stmt = (
                select(Entity)
                .where(Entity.workspace_id == workspace_id)
                .limit(limit)
                .order_by(Entity.created_at.desc())
            )
            if query:
                stmt = stmt.where(
                    Entity.name.ilike(f"%{query}%") | Entity.external_id.ilike(f"%{query}%")
                )
            res = await session.execute(stmt)
            entities = res.scalars().all()

            if not entities:
                return f"No entities found matching '{query}'."

            lines = [f"Found {len(entities)} entities:"]
            for e in entities:
                cnt_res = await session.execute(
                    select(func.count(Memory.id)).where(
                        Memory.entity_id == e.id,
                        Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
                    )
                )
                count = cnt_res.scalar() or 0
                lines.append(
                    f"• {e.name} (External ID: `{e.external_id}`) | Type: {e.entity_type.value} | Active Claims: {count}"
                )

            return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool 5: Delete / Forget Memory
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_forget",
        description="Permanently delete a memory claim and its linked evidence by ID.",
    )
    async def forget_memory(memory_id: int) -> str:
        if api_url:
            import httpx

            async with httpx.AsyncClient(base_url=api_url, timeout=30.0) as client:
                res = await client.delete(
                    f"/api/memories/{memory_id}",
                    headers=_auth_headers(api_key),
                )
                if res.status_code == 404:
                    return f"Memory #{memory_id} not found."
                if not res.is_success:
                    return f"Error deleting memory: {res.text}"
                return f"Memory #{memory_id} deleted."

        from sqlalchemy import delete, func, select, update

        from .database import get_session_factory, init_db
        from .models import Episode, Evidence, Memory

        await init_db()

        async with get_session_factory()() as session:
            mem = await session.get(Memory, memory_id)
            if not mem or mem.workspace_id != workspace_id:
                return f"Memory with ID {memory_id} not found."

            claim_text = mem.claim
            ep_res = await session.execute(
                select(Evidence.episode_id).where(Evidence.memory_id == memory_id)
            )
            linked_episode_ids = {row[0] for row in ep_res.all()}

            await session.execute(
                update(Memory).where(Memory.superseded_by_id == memory_id).values(superseded_by_id=None)
            )
            await session.execute(delete(Evidence).where(Evidence.memory_id == memory_id))
            await session.delete(mem)
            await session.flush()

            for ep_id in linked_episode_ids:
                remaining = (
                    await session.execute(
                        select(func.count()).select_from(Evidence).where(Evidence.episode_id == ep_id)
                    )
                ).scalar() or 0
                if remaining == 0:
                    await session.execute(
                        delete(Episode).where(
                            Episode.id == ep_id,
                            Episode.workspace_id == workspace_id,
                        )
                    )

            await session.commit()
            return f"Memory #{memory_id} ('{claim_text}') was deleted."

    # ─────────────────────────────────────────────────────────────
    # Resource: Entity State Template
    # ─────────────────────────────────────────────────────────────
    @server.resource("cluestate://entities/{external_id}")
    async def get_entity_resource(external_id: str) -> str:
        """Resource template providing structured entity state."""
        return await get_entity_intel(external_id)

    return server


def run_mcp(transport: str = "stdio", host: str = "0.0.0.0", port: int = 8001):
    """Run the ClueState MCP server."""
    server = create_mcp_server()
    if transport == "stdio":
        server.run(transport="stdio")
    elif transport in ("sse", "streamable-http"):
        server.run(transport=transport, host=host, port=port)
    else:
        raise ValueError(f"Unsupported transport: {transport}. Choose 'stdio', 'sse', or 'streamable-http'.")


if __name__ == "__main__":
    run_mcp()
