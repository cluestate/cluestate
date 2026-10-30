"""Tests for Model Context Protocol (MCP) server."""

import pytest
from cluestate.mcp_server import create_mcp_server


@pytest.mark.asyncio
async def test_mcp_server_initialization():
    server = create_mcp_server()
    assert server.name == "cluestate"

    # Verify registered tools
    tools = await server.list_tools()
    tool_names = [t.name for t in tools]
    assert "cluestate_ingest" in tool_names
    assert "cluestate_get_intel" in tool_names
    assert "cluestate_list_memories" in tool_names
    assert "cluestate_search_entities" in tool_names
    assert "cluestate_forget" in tool_names

    # Verify registered resource templates
    templates = await server.list_resource_templates()
    uris = [t.uri_template for t in templates]
    assert "cluestate://entities/{external_id}" in uris
