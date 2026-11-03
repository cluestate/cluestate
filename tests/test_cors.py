"""Tests for CORS handling in ClueState API across client applications."""

import pytest
from httpx import ASGITransport, AsyncClient

from cluestate.config import Settings
from cluestate.main import create_app


@pytest.mark.asyncio
async def test_cors_preflight_allows_arbitrary_client_origin():
    """Verify that client web applications (like app.coevoapps.com) can perform CORS preflights."""
    app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        res = await ac.options(
            "/api/health",
            headers={
                "Origin": "https://app.coevoapps.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,x-custom-header",
            },
        )

        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "https://app.coevoapps.com"
        assert res.headers.get("access-control-allow-credentials") == "true"
        assert "POST" in res.headers.get("access-control-allow-methods", "")
        # With allow_headers=["*"], the requested headers are mirrored back
        allow_headers = res.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in allow_headers
        assert "content-type" in allow_headers
        assert res.headers.get("access-control-max-age") == "86400"


@pytest.mark.asyncio
async def test_cors_actual_request_reflects_origin():
    """Verify that actual cross-origin requests receive Access-Control-Allow-Origin."""
    app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        res = await ac.get(
            "/api/health",
            headers={
                "Origin": "https://app.coevoapps.com",
            },
        )

        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "https://app.coevoapps.com"
        assert res.headers.get("access-control-allow-credentials") == "true"
        assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_cors_restricted_origins(monkeypatch):
    """Verify that when explicit CORS_ORIGINS are configured, only those origins are allowed."""
    test_settings = Settings(cors_origins="https://allowed1.com,https://allowed2.com")
    monkeypatch.setattr("cluestate.main.get_settings", lambda: test_settings)

    app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        # 1. Allowed origin preflight
        res_allowed = await ac.options(
            "/api/health",
            headers={
                "Origin": "https://allowed1.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert res_allowed.status_code == 200
        assert res_allowed.headers.get("access-control-allow-origin") == "https://allowed1.com"

        # 2. Disallowed origin preflight
        res_disallowed = await ac.options(
            "/api/health",
            headers={
                "Origin": "https://disallowed.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert res_disallowed.status_code == 400
        assert res_disallowed.headers.get("access-control-allow-origin") is None

