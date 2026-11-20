"""Authentication, signup, login, invite acceptance, and workspace API key management endpoints."""

import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..models import (
    ApiKey,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
    WorkspaceRole,
)
from ..schemas import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyRead,
    AuthResponse,
    InviteAcceptRequest,
    LoginRequest,
    SignupRequest,
    UserRead,
    WorkspaceRead,
)
from ..security import (
    _extract_bearer_token,
    create_access_token,
    decode_access_token,
    generate_api_key,
    get_current_user,
    get_user_workspace_role,
    hash_password,
    list_user_workspaces,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or f"ws-{secrets.token_hex(4)}"


def _to_workspace_read(ws: Workspace, role: WorkspaceRole | None = None) -> WorkspaceRead:
    data = ws.model_dump()
    data["role"] = role
    return WorkspaceRead(**data)


@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(body: SignupRequest, session: AsyncSession = Depends(get_session)):
    """Create a new user account, workspace, owner membership, and default API key."""
    settings = get_settings()
    user_count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
    if user_count > 0 and not settings.allow_signup:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public signup is disabled after initial account setup. Use a workspace invite link or set ALLOW_SIGNUP=true.",
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

    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WorkspaceRole.OWNER,
    )
    session.add(membership)

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
    ws_read = _to_workspace_read(workspace, WorkspaceRole.OWNER)

    return AuthResponse(
        access_token=token,
        user=UserRead(**user.model_dump()),
        workspace=ws_read,
        workspaces=[ws_read],
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

    user_workspaces = await list_user_workspaces(session, user.id)
    if not user_workspaces:
        workspace = Workspace(
            name=f"{user.full_name or user.email}'s Workspace",
            slug=f"ws-{user.id}-{secrets.token_hex(3)}",
            owner_id=user.id,
        )
        session.add(workspace)
        await session.flush()
        session.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user.id,
                role=WorkspaceRole.OWNER,
            )
        )
        await session.commit()
        await session.refresh(workspace)
        user_workspaces = [(workspace, WorkspaceRole.OWNER)]

    primary_ws, primary_role = user_workspaces[0]
    token = create_access_token(user_id=user.id, workspace_id=primary_ws.id, email=user.email)
    ws_reads = [_to_workspace_read(w, r) for w, r in user_workspaces]

    return AuthResponse(
        access_token=token,
        user=UserRead(**user.model_dump()),
        workspace=_to_workspace_read(primary_ws, primary_role),
        workspaces=ws_reads,
    )


@router.get("/me")
async def get_me(
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return current authenticated user, active workspace, and all accessible workspaces."""
    user, workspace = auth
    role = await get_user_workspace_role(session, user.id, workspace) or WorkspaceRole.MEMBER
    all_ws = await list_user_workspaces(session, user.id)
    return {
        "user": UserRead(**user.model_dump()),
        "workspace": _to_workspace_read(workspace, role),
        "workspaces": [_to_workspace_read(w, r) for w, r in all_ws],
    }


@router.get("/invites/{token}")
async def inspect_invite(token: str, session: AsyncSession = Depends(get_session)):
    """Public endpoint to inspect a workspace invite token before accepting."""
    res = await session.execute(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
    invite = res.scalars().first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite link not found")

    now = datetime.now(timezone.utc)
    exp = invite.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if invite.accepted_at is not None:
        raise HTTPException(status_code=410, detail="This invite link has already been used")
    if exp < now:
        raise HTTPException(status_code=410, detail="This invite link has expired")

    ws = await session.get(Workspace, invite.workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    return {
        "token": invite.token,
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "workspace_slug": ws.slug,
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at,
    }


@router.post("/invites/{token}/accept", response_model=AuthResponse)
async def accept_invite(
    token: str,
    body: InviteAcceptRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Accept a workspace invite link.
    Works for an already signed-in user (via Bearer JWT) OR creates/authenticates an account from body credentials.
    """
    res = await session.execute(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
    invite = res.scalars().first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite link not found")

    now = datetime.now(timezone.utc)
    exp = invite.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if invite.accepted_at is not None:
        raise HTTPException(status_code=410, detail="This invite link has already been used")
    if exp < now:
        raise HTTPException(status_code=410, detail="This invite link has expired")

    workspace = await session.get(Workspace, invite.workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    user: User | None = None
    bearer = _extract_bearer_token(request)
    if bearer and not bearer.startswith("cs_"):
        payload = decode_access_token(bearer)
        if payload:
            user = await session.get(User, int(payload.get("sub", 0)))

    if not user:
        email_norm = (body.email or invite.email or "").strip().lower()
        if not email_norm or "@" not in email_norm:
            raise HTTPException(status_code=400, detail="Email address is required to accept this invite")
        if invite.email and invite.email.strip().lower() != email_norm:
            raise HTTPException(
                status_code=403,
                detail=f"This invite is restricted to {invite.email}",
            )
        if not body.password or len(body.password) < 8:
            raise HTTPException(status_code=400, detail="Password (min 8 characters) is required")

        existing_res = await session.execute(select(User).where(User.email == email_norm))
        existing_user = existing_res.scalars().first()
        if existing_user:
            if not verify_password(body.password, existing_user.password_hash):
                raise HTTPException(
                    status_code=401,
                    detail="An account with this email exists. Enter your existing password to join the workspace.",
                )
            user = existing_user
        else:
            user = User(
                email=email_norm,
                password_hash=hash_password(body.password),
                full_name=body.full_name.strip() or email_norm.split("@")[0],
            )
            session.add(user)
            await session.flush()

    if invite.email and invite.email.strip().lower() != user.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite is restricted to {invite.email}",
        )

    mem_res = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == user.id,
        )
    )
    membership = mem_res.scalars().first()
    if not membership:
        membership = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=invite.role,
        )
        session.add(membership)
        effective_role = invite.role
    else:
        effective_role = membership.role

    invite.accepted_at = now
    session.add(invite)
    await session.commit()
    await session.refresh(user)
    await session.refresh(workspace)

    all_ws = await list_user_workspaces(session, user.id)
    jwt_token = create_access_token(user_id=user.id, workspace_id=workspace.id, email=user.email)

    return AuthResponse(
        access_token=jwt_token,
        user=UserRead(**user.model_dump()),
        workspace=_to_workspace_read(workspace, effective_role),
        workspaces=[_to_workspace_read(w, r) for w, r in all_ws],
    )


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
    user, workspace = auth
    role = await get_user_workspace_role(session, user.id, workspace)
    if role == WorkspaceRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot create API keys")

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
    user, workspace = auth
    role = await get_user_workspace_role(session, user.id, workspace)
    if role == WorkspaceRole.VIEWER:
        raise HTTPException(status_code=403, detail="Viewers cannot revoke API keys")

    api_key = await session.get(ApiKey, key_id)
    if not api_key or api_key.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="API key not found")

    await session.delete(api_key)
    await session.commit()
