"""Authentication, signup, login, and workspace API key management endpoints."""

import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..models import ApiKey, User, Workspace
from ..schemas import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyRead,
    AuthResponse,
    LoginRequest,
    SignupRequest,
    UserRead,
    WorkspaceRead,
)
from ..security import (
    create_access_token,
    generate_api_key,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or f"ws-{secrets.token_hex(4)}"


@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(body: SignupRequest, session: AsyncSession = Depends(get_session)):
    """Create a new user account, workspace, and default API key."""
    settings = get_settings()
    user_count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
    if user_count > 0 and not settings.allow_signup:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public signup is disabled after initial account setup. Set ALLOW_SIGNUP=true to allow additional signups.",
        )

    email_norm = body.email.strip().lower()
    if "@" not in email_norm:
        raise HTTPException(status_code=400, detail="Valid email address is required")

    existing = await session.execute(select(User).where(User.email == email_norm))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        email=email_norm,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip() or email_norm.split("@")[0],
    )
    session.add(user)
    await session.flush()

    ws_name = body.workspace_name.strip() or f"{user.full_name}'s Workspace"
    base_slug = _slugify(ws_name)
    slug = base_slug
    slug_check = await session.execute(select(Workspace).where(Workspace.slug == slug))
    if slug_check.scalars().first():
        slug = f"{base_slug}-{secrets.token_hex(3)}"

    workspace = Workspace(
        name=ws_name,
        slug=slug,
        owner_id=user.id,
    )
    session.add(workspace)
    await session.flush()

    raw_key, key_prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        workspace_id=workspace.id,
        name="Default API Key",
        key_prefix=key_prefix,
        key_hash=key_hash,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(user)
    await session.refresh(workspace)

    token = create_access_token(user_id=user.id, workspace_id=workspace.id, email=user.email)

    return AuthResponse(
        access_token=token,
        user=UserRead(**user.model_dump()),
        workspace=WorkspaceRead(**workspace.model_dump()),
        initial_api_key=raw_key,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    """Authenticate with email and password."""
    email_norm = body.email.strip().lower()
    result = await session.execute(select(User).where(User.email == email_norm))
    user = result.scalars().first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    ws_result = await session.execute(
        select(Workspace).where(Workspace.owner_id == user.id).order_by(Workspace.id)
    )
    workspace = ws_result.scalars().first()

    if not workspace:
        workspace = Workspace(
            name=f"{user.full_name or user.email}'s Workspace",
            slug=f"ws-{user.id}-{secrets.token_hex(3)}",
            owner_id=user.id,
        )
        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)

    token = create_access_token(user_id=user.id, workspace_id=workspace.id, email=user.email)

    return AuthResponse(
        access_token=token,
        user=UserRead(**user.model_dump()),
        workspace=WorkspaceRead(**workspace.model_dump()),
    )


@router.get("/me")
async def get_me(auth: tuple[User, Workspace] = Depends(get_current_user)):
    """Return current authenticated user and active workspace."""
    user, workspace = auth
    return {
        "user": UserRead(**user.model_dump()),
        "workspace": WorkspaceRead(**workspace.model_dump()),
    }


@router.get("/api-keys", response_model=list[ApiKeyRead])
async def list_api_keys(
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all active API keys for the current workspace (requires user session)."""
    _, workspace = auth
    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.workspace_id == workspace.id, ApiKey.is_active == True)
        .order_by(ApiKey.created_at.desc())
    )
    return [ApiKeyRead(**k.model_dump()) for k in result.scalars().all()]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate a new scoped API key for the current workspace (requires user session)."""
    _, workspace = auth
    raw_key, key_prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        workspace_id=workspace.id,
        name=body.name.strip(),
        key_prefix=key_prefix,
        key_hash=key_hash,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return ApiKeyCreatedResponse(
        **api_key.model_dump(),
        raw_key=raw_key,
    )


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: int,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke and delete a workspace API key (requires user session)."""
    _, workspace = auth
    api_key = await session.get(ApiKey, key_id)
    if not api_key or api_key.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="API key not found")

    await session.delete(api_key)
    await session.commit()

