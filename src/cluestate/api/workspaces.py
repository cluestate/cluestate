"""Workspace management, multi-user membership (RBAC), zero-SMTP invite links, and extraction policy endpoints."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import (
    DEFAULT_EXTRACTION_POLICY,
    DEFAULT_SOURCE_TYPES,
    ApiKey,
    Topic,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
    WorkspaceRole,
    normalize_extraction_policy,
)
from ..schemas import (
    WorkspaceCreate,
    WorkspaceInviteCreate,
    WorkspaceInviteRead,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceUpdate,
)
from ..security import (
    generate_api_key,
    get_current_user,
    get_current_workspace,
    get_user_workspace_role,
    list_user_workspaces,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or f"ws-{secrets.token_hex(4)}"


def _to_workspace_read(ws: Workspace, role: WorkspaceRole | None = None) -> WorkspaceRead:
    data = ws.model_dump()
    data["role"] = role
    return WorkspaceRead(**data)


async def _require_workspace_role(
    session: AsyncSession,
    user: User,
    workspace_id: int,
    allowed_roles: tuple[WorkspaceRole, ...],
) -> tuple[Workspace, WorkspaceRole]:
    ws = await session.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    role = await get_user_workspace_role(session, user.id, ws)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    if role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of {[r.value for r in allowed_roles]} role in this workspace",
        )
    return ws, role


@router.get("", response_model=list[WorkspaceRead])
async def get_workspaces(
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all workspaces the authenticated user owns or belongs to."""
    user, _ = auth
    items = await list_user_workspaces(session, user.id)
    return [_to_workspace_read(ws, role) for ws, role in items]


@router.post("", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Create a new workspace, assign the current user as owner, mint a default API key,
    and optionally clone the Memory Schema & Extraction Policy from an existing workspace.
    """
    user, _ = auth
    ws_name = body.name.strip()
    base_slug = _slugify(ws_name)
    slug = base_slug
    slug_check = await session.execute(select(Workspace).where(Workspace.slug == slug))
    if slug_check.scalars().first():
        slug = f"{base_slug}-{secrets.token_hex(3)}"

    source_types = list(DEFAULT_SOURCE_TYPES)
    extraction_policy = dict(DEFAULT_EXTRACTION_POLICY)
    source_topics: list[Topic] = []

    if body.clone_schema_from_workspace_id:
        src_ws, _ = await _require_workspace_role(
            session,
            user,
            body.clone_schema_from_workspace_id,
            (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER),
        )
        source_types = list(src_ws.source_types or DEFAULT_SOURCE_TYPES)
        extraction_policy = normalize_extraction_policy(src_ws.extraction_policy)
        t_res = await session.execute(
            select(Topic).where(
                Topic.workspace_id == src_ws.id,
                Topic.is_active == True,
            )
        )
        source_topics = list(t_res.scalars().all())

    workspace = Workspace(
        name=ws_name,
        slug=slug,
        owner_id=user.id,
        source_types=source_types,
        extraction_policy=extraction_policy,
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

    for src_t in source_topics:
        cloned = Topic(
            workspace_id=workspace.id,
            name=src_t.name,
            label=src_t.label,
            description=src_t.description,
            extraction_instructions=src_t.extraction_instructions,
            examples=list(src_t.examples or []),
            data_type=src_t.data_type,
            cardinality=src_t.cardinality,
            update_policy=src_t.update_policy,
            temporal=src_t.temporal,
            ttl_days=src_t.ttl_days,
            enum_values=list(src_t.enum_values or []),
            allow_custom_values=src_t.allow_custom_values,
            allow_inferred=src_t.allow_inferred,
            min_confidence=src_t.min_confidence,
            constraints=dict(src_t.constraints or {}),
            applies_to_entity_types=list(src_t.applies_to_entity_types or []),
            schema_version=1,
            is_active=True,
        )
        session.add(cloned)

    raw_key, key_prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        workspace_id=workspace.id,
        name="Default API Key",
        key_prefix=key_prefix,
        key_hash=key_hash,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(workspace)

    return {
        "workspace": _to_workspace_read(workspace, WorkspaceRole.OWNER),
        "initial_api_key": raw_key,
    }


@router.get("/current", response_model=WorkspaceRead)
async def get_current_workspace_info(
    workspace: Workspace = Depends(get_current_workspace),
):
    """Return active workspace metadata and extraction policy (works with both JWT and cs_live_ API keys)."""
    return _to_workspace_read(workspace)


@router.put("/current/policy", response_model=WorkspaceRead)
async def update_current_workspace_policy(
    policy: dict[str, Any],
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Update the active workspace's memory extraction and discovery policy."""
    merged = dict(workspace.extraction_policy or DEFAULT_EXTRACTION_POLICY)
    merged.update(policy)
    workspace.extraction_policy = normalize_extraction_policy(merged)
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)
    return _to_workspace_read(workspace)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_id: int,
    body: WorkspaceUpdate,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update workspace name or extraction policy (requires Owner or Admin role)."""
    user, _ = auth
    ws, role = await _require_workspace_role(
        session, user, workspace_id, (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
    )

    if body.name is not None:
        if role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
            raise HTTPException(status_code=403, detail="Only owners and admins can rename a workspace")
        ws.name = body.name.strip()

    if body.extraction_policy is not None:
        merged = dict(ws.extraction_policy or DEFAULT_EXTRACTION_POLICY)
        merged.update(body.extraction_policy)
        ws.extraction_policy = normalize_extraction_policy(merged)

    session.add(ws)
    await session.commit()
    await session.refresh(ws)
    return _to_workspace_read(ws, role)


# ──────────────────────────────────────────────
# Workspace Members (RBAC)
# ──────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberRead])
async def list_workspace_members(
    workspace_id: int,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all members of a workspace."""
    user, _ = auth
    ws, _ = await _require_workspace_role(
        session,
        user,
        workspace_id,
        (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER),
    )

    # Ensure owner has a WorkspaceMember row if legacy data
    if ws.owner_id:
        owner_mem_res = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.user_id == ws.owner_id,
            )
        )
        if not owner_mem_res.scalars().first():
            session.add(
                WorkspaceMember(
                    workspace_id=ws.id,
                    user_id=ws.owner_id,
                    role=WorkspaceRole.OWNER,
                )
            )
            await session.commit()

    res = await session.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == ws.id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    members = []
    for wm, u in res.all():
        members.append(
            WorkspaceMemberRead(
                id=wm.id,
                workspace_id=wm.workspace_id,
                user_id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=wm.role,
                joined_at=wm.joined_at,
            )
        )
    return members


@router.post("/{workspace_id}/members", response_model=WorkspaceMemberRead, status_code=201)
async def add_workspace_member(
    workspace_id: int,
    body: WorkspaceMemberAdd,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Add an existing user by email directly to the workspace."""
    user, _ = auth
    ws, _ = await _require_workspace_role(
        session, user, workspace_id, (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    )

    email_norm = body.email.strip().lower()
    u_res = await session.execute(select(User).where(User.email == email_norm))
    target_user = u_res.scalars().first()
    if not target_user:
        raise HTTPException(
            status_code=404,
            detail=f"No existing user with email '{email_norm}'. Generate an invite link instead so they can create an account.",
        )

    existing_mem = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ws.id,
            WorkspaceMember.user_id == target_user.id,
        )
    )
    if existing_mem.scalars().first():
        raise HTTPException(status_code=409, detail="User is already a member of this workspace")

    wm = WorkspaceMember(
        workspace_id=ws.id,
        user_id=target_user.id,
        role=body.role,
    )
    session.add(wm)
    await session.commit()
    await session.refresh(wm)

    return WorkspaceMemberRead(
        id=wm.id,
        workspace_id=wm.workspace_id,
        user_id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=wm.role,
        joined_at=wm.joined_at,
    )


@router.patch("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberRead)
async def update_workspace_member_role(
    workspace_id: int,
    member_id: int,
    body: WorkspaceMemberUpdate,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Change a member's role in the workspace."""
    user, _ = auth
    ws, caller_role = await _require_workspace_role(
        session, user, workspace_id, (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    )

    wm = await session.get(WorkspaceMember, member_id)
    if not wm or wm.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Member not found")

    if wm.role == WorkspaceRole.OWNER and caller_role != WorkspaceRole.OWNER:
        raise HTTPException(status_code=403, detail="Only a workspace owner can modify an owner's role")

    wm.role = body.role
    session.add(wm)
    await session.commit()
    await session.refresh(wm)

    target_user = await session.get(User, wm.user_id)
    return WorkspaceMemberRead(
        id=wm.id,
        workspace_id=wm.workspace_id,
        user_id=wm.user_id,
        email=target_user.email if target_user else "",
        full_name=target_user.full_name if target_user else "",
        role=wm.role,
        joined_at=wm.joined_at,
    )


@router.delete("/{workspace_id}/members/{member_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: int,
    member_id: int,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove a member from a workspace."""
    user, _ = auth
    ws, caller_role = await _require_workspace_role(
        session,
        user,
        workspace_id,
        (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER),
    )

    wm = await session.get(WorkspaceMember, member_id)
    if not wm or wm.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Member not found")

    # Allow self-removal (unless sole owner), otherwise require owner/admin
    if wm.user_id != user.id and caller_role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners and admins can remove other members")

    if wm.user_id == ws.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove the primary workspace owner")

    await session.delete(wm)
    await session.commit()


# ──────────────────────────────────────────────
# Zero-SMTP Workspace Invites
# ──────────────────────────────────────────────

@router.get("/{workspace_id}/invites", response_model=list[WorkspaceInviteRead])
async def list_workspace_invites(
    workspace_id: int,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List pending invite links for a workspace."""
    user, _ = auth
    ws, _ = await _require_workspace_role(
        session,
        user,
        workspace_id,
        (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER),
    )

    res = await session.execute(
        select(WorkspaceInvite)
        .where(
            WorkspaceInvite.workspace_id == ws.id,
            WorkspaceInvite.accepted_at.is_(None),
        )
        .order_by(WorkspaceInvite.created_at.desc())
    )
    return [
        WorkspaceInviteRead(
            **inv.model_dump(),
            workspace_name=ws.name,
        )
        for inv in res.scalars().all()
    ]


@router.post("/{workspace_id}/invites", response_model=WorkspaceInviteRead, status_code=201)
async def create_workspace_invite(
    workspace_id: int,
    body: WorkspaceInviteCreate,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate a single-use invite token for a teammate to join the workspace."""
    user, _ = auth
    ws, _ = await _require_workspace_role(
        session, user, workspace_id, (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    )

    now = datetime.now(timezone.utc)
    invite = WorkspaceInvite(
        workspace_id=ws.id,
        token=secrets.token_urlsafe(24),
        email=body.email.strip().lower(),
        role=body.role,
        created_by_id=user.id,
        expires_at=now + timedelta(days=body.expires_in_days),
        created_at=now,
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)

    return WorkspaceInviteRead(
        **invite.model_dump(),
        workspace_name=ws.name,
    )


@router.delete("/{workspace_id}/invites/{invite_id}", status_code=204)
async def revoke_workspace_invite(
    workspace_id: int,
    invite_id: int,
    auth: tuple[User, Workspace] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Revoke and delete a pending workspace invite."""
    user, _ = auth
    ws, _ = await _require_workspace_role(
        session, user, workspace_id, (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
    )

    invite = await session.get(WorkspaceInvite, invite_id)
    if not invite or invite.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Invite not found")

    await session.delete(invite)
    await session.commit()
