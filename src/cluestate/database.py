"""Async database engine and session management."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from .config import get_settings

_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {}
        if settings.is_sqlite:
            connect_args["check_same_thread"] = False

        _engine = create_async_engine(
            settings.database_url,
            echo=(settings.log_level == "debug"),
            connect_args=connect_args,
        )
    return _engine


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


def async_session_maker() -> AsyncSession:
    """Return a new AsyncSession context manager from the active session factory."""
    return get_session_factory()()


async def get_session():
    """FastAPI dependency that yields an async database session."""
    async with get_session_factory()() as session:
        yield session


async def ensure_default_workspace(session: AsyncSession):
    """Ensure workspace id=1 exists for single-tenant or initial setup."""
    from .models import Workspace

    result = await session.execute(select(Workspace).order_by(Workspace.id).limit(1))
    workspace = result.scalars().first()
    if not workspace:
        workspace = Workspace(id=1, name="Default Workspace", slug="default")
        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)
    return workspace


async def init_db():
    """Create all tables and ensure the default workspace exists."""
    from . import models  # noqa: F401 — ensure models are registered

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with get_session_factory()() as session:
        await ensure_default_workspace(session)


async def close_db():
    """Dispose engine on shutdown."""
    global _engine, _session_factory
    if _engine:
        await _engine.dispose()
        _engine = None
        _session_factory = None
