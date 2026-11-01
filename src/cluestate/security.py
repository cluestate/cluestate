"""Authentication, password hashing, JWT tokens, and workspace-scoped API keys."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import ensure_default_workspace, get_session
from .models import ApiKey, User, Workspace

PBKDF2_ITERATIONS = 600_000


# ──────────────────────────────────────────────
# Password Hashing (PBKDF2-HMAC-SHA256)
# ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_str, salt, expected_hex = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_str)
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


# ──────────────────────────────────────────────
# API Key Generation & Hashing
# ──────────────────────────────────────────────

def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new workspace API key.

    Returns: (raw_key, key_prefix, key_hash)
    """
    token = secrets.token_urlsafe(28)
    raw_key = f"cs_live_{token}"
    key_prefix = raw_key[:14]
    key_hash = hash_api_key(raw_key)
    return raw_key, key_prefix, key_hash


# ──────────────────────────────────────────────
# JWT Session Tokens (HMAC-SHA256)
# ──────────────────────────────────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def create_access_token(user_id: int, workspace_id: int, email: str) -> str:
    settings = get_settings()
    now = int(time.time())
    exp = now + (settings.access_token_expire_minutes * 60)

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "workspace_id": workspace_id,
        "email": email,
        "iat": now,
        "exp": exp,
    }

    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

    signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    sig_b64 = _b64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[dict]:
    settings = get_settings()
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(
            settings.secret_key.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


# ──────────────────────────────────────────────
# FastAPI Authentication Dependencies
# ──────────────────────────────────────────────

def _extract_bearer_token(request: Request) -> Optional[str]:
    """Extract token strictly from the Authorization: Bearer header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    return token or None


async def get_current_workspace(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Workspace:
    """
    Authenticate request via Workspace API Key (cs_live_...), JWT session token,
    or configured static API_KEY, and return the active Workspace.
    """
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token or API key in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()

    # 1. Static environment API_KEY (for single-tenant / self-hosted automation)
    if settings.api_key and hmac.compare_digest(token, settings.api_key):
        return await ensure_default_workspace(session)

    # 2. Scoped Workspace API Key (starts with cs_)
    if token.startswith("cs_"):
        key_hash = hash_api_key(token)
        result = await session.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
        )
        api_key_obj = result.scalars().first()
        if not api_key_obj:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key",
            )
        api_key_obj.last_used_at = datetime.now(timezone.utc)
        workspace = await session.get(Workspace, api_key_obj.workspace_id)
        if not workspace:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Workspace not found")
        await session.commit()
        return workspace

    # 3. User JWT Session Token
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    workspace_id = payload.get("workspace_id")
    user_id = int(payload.get("sub", 0))

    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account inactive or not found")

    workspace = await session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Workspace not found")

    return workspace


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> tuple[User, Workspace]:
    """Require an interactive User JWT session token (rejects cs_ API keys with 403)."""
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    settings = get_settings()
    if token.startswith("cs_") or (settings.api_key and hmac.compare_digest(token, settings.api_key)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API keys cannot perform user or API-key administration. Authenticate with a user session token.",
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )

    user_id = int(payload.get("sub", 0))
    workspace_id = int(payload.get("workspace_id", 0))

    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    workspace = await session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    return user, workspace

