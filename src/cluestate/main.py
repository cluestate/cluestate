"""FastAPI application — unified entry point for the ClueState API and Platform UI."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import get_settings
from .database import close_db, init_db

logger = logging.getLogger("cluestate")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize database schema and default workspace. Shutdown: dispose engine."""
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info(f"ClueState v{__version__} starting up")
    logger.info(
        f"Database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}"
    )
    logger.info(f"LLM Model: {settings.llm_model}")

    await init_db()
    logger.info("Database initialized")
    yield
    await close_db()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="ClueState",
        description="ClueState — Evidence-backed customer and entity intelligence infrastructure.",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.parsed_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    # ── API Routes ──
    from .api.auth import router as auth_router
    from .api.entities import router as entities_router
    from .api.ingest import router as ingest_router
    from .api.memories import router as memories_router
    from .api.stats import router as stats_router
    from .api.topics import router as topics_router

    app.include_router(auth_router, prefix="/api")
    app.include_router(entities_router, prefix="/api")
    app.include_router(topics_router, prefix="/api")
    app.include_router(ingest_router, prefix="/api")
    app.include_router(memories_router, prefix="/api")
    app.include_router(stats_router, prefix="/api")

    # ── Health Check (Public) ──
    @app.get("/api/health", tags=["System"])
    async def health():
        return {
            "status": "ok",
            "version": __version__,
            "llm_model": settings.llm_model,
            "database": "sqlite" if settings.is_sqlite else "postgresql",
        }

    # ── Platform UI (compiled React SPA) ──
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.exists(static_dir) and os.path.exists(os.path.join(static_dir, "index.html")):
        assets_dir = os.path.join(static_dir, "assets")
        if os.path.exists(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_admin_spa(full_path: str):
            """Serve the React SPA. Falls back to index.html for client-side routing."""
            target = os.path.join(static_dir, full_path)
            if full_path and os.path.isfile(target):
                return FileResponse(target)
            return FileResponse(os.path.join(static_dir, "index.html"))
    else:
        @app.get("/", include_in_schema=False)
        async def root():
            return {
                "name": "ClueState",
                "version": __version__,
                "docs": "/docs",
                "admin_ui": "Not compiled. Run `npm run build` in admin/.",
            }

    return app


# Module-level app instance for `uvicorn cluestate.main:app`
app = create_app()
