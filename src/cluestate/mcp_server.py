"""Model Context Protocol (MCP) server for ClueState.

Enables Claude Desktop, Cursor, Zed, Windsurf, and autonomous AI agents
to directly ingest, retrieve, and manage persistent entity memory.
"""

import asyncio
import os
import sys
from typing import Optional

# Support both mcp 2.x (MCPServer) and mcp 1.x (FastMCP)
try:
    from mcp.server.mcpserver import MCPServer
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP as MCPServer
    except ImportError:
        MCPServer = None


def create_mcp_server() -> "MCPServer":
    if MCPServer is None:
        raise RuntimeError(
            "The 'mcp' package is not installed. Install it with: pip install 'cluestate[mcp]' or pip install mcp"
        )

    server = MCPServer(
        name="cluestate",
        description="Audited Entity Intelligence & Memory Engine with confidence scoring and evidence trails.",
    )

    api_url = os.getenv("CLUESTATE_API_URL", "").rstrip("/")
    api_key = os.getenv("CLUESTATE_API_KEY", "")

    # ─────────────────────────────────────────────────────────────
    # Tool: Ingest Memory
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_ingest",
        description=(
            "Extract and save persistent factual claims about an entity (user, customer, project, organization) "
            "from unstructured text, dialogue, or notes. Automatically resolves contradictions and links source evidence."
        ),
    )
    async def ingest_memory(
        external_id: str,
        content: str,
        entity_name: str = "",
        source_type: str = "conversation",
        source_description: str = "",
    ) -> str:
        """
        Extract and save persistent knowledge about an entity.

        :param external_id: Unique entity key (e.g. 'user_123', 'acme_corp', 'client_sarah')
        :param content: Unstructured text containing facts or preferences
        :param entity_name: Optional human-readable name of the entity
        :param source_type: 'conversation', 'email', 'note', 'support_ticket', 'call_transcript'
        :param source_description: Short context for this interaction
        """
        # Remote mode (via REST API)
        if api_url:
            import httpx

            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            async with httpx.AsyncClient(base_url=api_url, timeout=60.0) as client:
                res = await client.post(
                    "/api/ingest",
                    headers=headers,
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
                    return f"Error ingesting memory: {res.text}"
                data = res.json()
        else:
            # Local in-process mode
            from sqlalchemy import select
            from .database import async_session_maker, init_db
            from .engine import extract_memories_from_text, process_extracted_claims
            from .models import Entity, EntityType, Episode, Memory, MemoryStatus, SourceType, Topic

            await init_db()

            async with async_session_maker() as session:
                # Find or create entity
                res_ent = await session.execute(
                    select(Entity).where(Entity.external_id == external_id)
                )
                entity = res_ent.scalars().first()
                if not entity:
                    entity = Entity(
                        external_id=external_id,
                        name=entity_name or external_id,
                        entity_type=EntityType.PERSON,
                    )
                    session.add(entity)
                    await session.flush()

                # Record Episode
                try:
                    st_enum = SourceType(source_type.lower())
                except ValueError:
                    st_enum = SourceType.CUSTOM

                episode = Episode(
                    entity_id=entity.id,
                    source_type=st_enum,
                    content=content,
                    source_description=source_description,
                )
                session.add(episode)
                await session.flush()

                # Get existing memories & topics
                res_mem = await session.execute(
                    select(Memory).where(
                        Memory.entity_id == entity.id,
                        Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
                    )
                )
                existing_memories = list(res_mem.scalars().all())

                res_topics = await session.execute(
                    select(Topic).where(Topic.is_active == True)
                )
                topics = list(res_topics.scalars().all())

                # Extract claims via LLM
                extraction = await extract_memories_from_text(
                    content=content,
                    entity_name=entity.name or entity.external_id,
                    existing_memories=existing_memories,
                    topics=topics,
                )

                all_memories, new_count, updated_count = await process_extracted_claims(
                    session=session,
                    entity=entity,
                    episode=episode,
                    extraction=extraction,
                    topics=topics,
                )
                await session.commit()

                data = {
                    "memories_extracted": len(all_memories),
                    "memories_new": new_count,
                    "memories_updated": updated_count,
                    "memories": [
                        {
                            "claim": m.claim,
                            "confidence": m.confidence,
                            "status": m.status.value if hasattr(m.status, "value") else str(m.status),
                        }
                        for m in all_memories
                    ],
                }

        lines = [
            f"✅ Successfully extracted {data['memories_extracted']} facts for '{external_id}':",
            f"• {data['memories_new']} new memories",
            f"• {data['memories_updated']} updated / superseded memories",
            "\nExtracted Claims:",
        ]
        for m in data.get("memories", []):
            conf = int(m.get("confidence", 0) * 100)
            lines.append(f" - {m.get('claim')} ({conf}% confidence, {m.get('status')})")

        return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool: Get Entity Intel
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_get_intel",
        description=(
            "Retrieve verified, structured markdown intelligence block about an entity "
            "to prepend to an agent prompt or inform answers. Groups facts by topic with confidence scores."
        ),
    )
    async def get_entity_intel(external_id: str) -> str:
        """
        Get compiled knowledge about an entity.

        :param external_id: The entity identifier to look up
        """
        if api_url:
            import httpx

            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            async with httpx.AsyncClient(base_url=api_url, timeout=30.0) as client:
                res = await client.get(
                    f"/api/intel/by-external-id/{external_id}",
                    headers=headers,
                )
                if res.status_code == 404:
                    return f"No memories or profile found for entity '{external_id}'."
                if not res.is_success:
                    return f"Error retrieving intelligence: {res.text}"
                return res.json().get("formatted_prompt", "No facts recorded.")
        else:
            from sqlalchemy import select
            from .database import async_session_maker, init_db
            from .engine import format_entity_intel
            from .models import Entity

            await init_db()

            async with async_session_maker() as session:
                res = await session.execute(
                    select(Entity).where(Entity.external_id == external_id)
                )
                entity = res.scalars().first()
                if not entity:
                    return f"No memories or profile found for entity '{external_id}'."

                intel_text = await format_entity_intel(session, entity)
                return intel_text or f"Entity '{external_id}' is tracked, but has 0 active memories."

    # ─────────────────────────────────────────────────────────────
    # Tool: List Memories with Evidence
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_list_memories",
        description="List atomic claims for an entity with detailed confidence scores, topic tags, and source quotation evidence.",
    )
    async def list_memories(
        external_id: str,
        topic: str = "",
        status: str = "active",
    ) -> str:
        """
        List claims and source quotes for an entity.

        :param external_id: Entity ID
        :param topic: Optional topic category filter (e.g. 'tech_stack', 'preferences', 'budget')
        :param status: 'active', 'confirmed', 'rejected', 'superseded', or 'all'
        """
        from sqlalchemy import select
        from .database import async_session_maker, init_db
        from .models import Entity, Evidence, Memory, MemoryStatus, Topic

        await init_db()

        async with async_session_maker() as session:
            res_ent = await session.execute(
                select(Entity).where(Entity.external_id == external_id)
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
                return f"No memories found matching status '{status}' for '{external_id}'."

            lines = [f"Found {len(memories)} memories for '{entity.name or external_id}':\n"]
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

                # Fetch evidence quotes
                ev_res = await session.execute(
                    select(Evidence).where(Evidence.memory_id == m.id)
                )
                evidence_list = ev_res.scalars().all()
                for ev in evidence_list:
                    lines.append(f'    Quote: "{ev.excerpt}"')

            return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool: Search Entities
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_search_entities",
        description="Search tracked entities by name or external ID to discover existing profiles.",
    )
    async def search_entities(query: str = "", limit: int = 10) -> str:
        """
        Search for entities.

        :param query: Name or external ID search substring
        :param limit: Maximum number of results
        """
        from sqlalchemy import func, select
        from .database import async_session_maker, init_db
        from .models import Entity, Memory, MemoryStatus

        await init_db()

        async with async_session_maker() as session:
            stmt = select(Entity).limit(limit).order_by(Entity.created_at.desc())
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
                    f"• {e.name} (External ID: `{e.external_id}`) | Type: {e.entity_type} | Facts: {count}"
                )

            return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────
    # Tool: Delete / Forget Memory
    # ─────────────────────────────────────────────────────────────
    @server.tool(
        name="cluestate_forget",
        description="Permanently delete an obsolete, erroneous, or requested-to-forget memory claim by ID.",
    )
    async def forget_memory(memory_id: int) -> str:
        """
        Delete a memory by its ID.

        :param memory_id: The integer ID of the memory to remove
        """
        from .database import async_session_maker, init_db
        from .models import Memory

        await init_db()

        async with async_session_maker() as session:
            mem = await session.get(Memory, memory_id)
            if not mem:
                return f"Memory with ID {memory_id} not found."

            claim_text = mem.claim
            await session.delete(mem)
            await session.commit()
            return f"✅ Memory #{memory_id} ('{claim_text}') was deleted successfully."

    # ─────────────────────────────────────────────────────────────
    # Resource: Entity Intel Prompt
    # ─────────────────────────────────────────────────────────────
    @server.resource("cluestate://entities/{external_id}")
    async def get_entity_resource(external_id: str) -> str:
        """Resource template providing entity intelligence context."""
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
