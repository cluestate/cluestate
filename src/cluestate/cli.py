"""CLI entry point: `cluestate serve`, `cluestate init`, etc."""

import click
import uvicorn

from . import __version__
from .config import get_settings


@click.group()
@click.version_option(version=__version__, prog_name="cluestate")
def cli():
    """ClueState — Evidence-backed customer and entity intelligence infrastructure."""
    pass


@cli.command()
@click.option("--host", default=None, help="Bind host (default: from config or 0.0.0.0)")
@click.option("--port", default=None, type=int, help="Bind port (default: from config or 8000)")
@click.option("--reload", is_flag=True, help="Auto-reload on code changes (dev mode)")
@click.option("--log-level", default=None, help="Log level (debug, info, warning, error)")
def serve(host, port, reload, log_level):
    """Start the ClueState API server."""
    settings = get_settings()

    uvicorn.run(
        "cluestate.main:app",
        host=host or settings.host,
        port=port or settings.port,
        reload=reload,
        log_level=log_level or settings.log_level,
    )


@cli.command()
def init():
    """Initialize or migrate the database to the latest schema."""
    import asyncio

    from .database import init_db

    async def _init():
        await init_db()
        click.secho("[OK] Database migrated and initialized successfully.", fg="green")

    asyncio.run(_init())


@cli.command()
def migrate():
    """Run Alembic database migrations up to 'head'."""
    import asyncio

    from .database import init_db

    async def _migrate():
        await init_db()
        click.secho("[OK] Alembic migrations applied (head).", fg="green")

    asyncio.run(_migrate())


@cli.command()
def check():
    """Check configuration and connectivity."""
    settings = get_settings()

    click.echo(f"ClueState v{__version__}")
    click.echo(f"  Database:  {settings.database_url}")
    click.echo(f"  LLM Model: {settings.llm_model}")
    click.echo(f"  Host:      {settings.host}:{settings.port}")
    auth_mode = (
        "Workspace Auth + Static Master Key"
        if settings.api_key
        else "Workspace Auth (JWT + cs_live_ API keys enforced)"
    )
    click.echo(f"  Auth Mode: {auth_mode}")

    # Check LLM key
    model_prefix = settings.llm_model.split("/")[0] if "/" in settings.llm_model else ""
    if model_prefix == "openai" and not settings.openai_api_key:
        click.secho("  [!] OPENAI_API_KEY not set", fg="yellow")
    elif model_prefix == "anthropic" and not settings.anthropic_api_key:
        click.secho("  [!] ANTHROPIC_API_KEY not set", fg="yellow")
    elif model_prefix == "gemini" and not settings.gemini_api_key:
        click.secho("  [!] GEMINI_API_KEY not set", fg="yellow")
    else:
        click.secho("  [OK] LLM API key appears configured", fg="green")


@cli.command()
@click.option("--transport", default="stdio", type=click.Choice(["stdio", "sse", "streamable-http"]), help="Transport protocol (default: stdio)")
@click.option("--host", default="0.0.0.0", help="Bind host for SSE/HTTP (default: 0.0.0.0)")
@click.option("--port", default=8001, type=int, help="Bind port for SSE/HTTP (default: 8001)")
def mcp(transport, host, port):
    """Start the Model Context Protocol (MCP) server for Claude Desktop, Cursor, and AI agents."""
    from .mcp_server import run_mcp

    run_mcp(transport=transport, host=host, port=port)


if __name__ == "__main__":
    cli()
