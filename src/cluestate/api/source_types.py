"""Source Types endpoint — manage dynamic provenance categories per workspace."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import DEFAULT_SOURCE_TYPES, Workspace, ensure_workspace_source_type, normalize_source_type
from ..schemas import SourceTypeCreate, SourceTypesResponse
from ..security import get_current_workspace

logger = logging.getLogger("cluestate.api.source_types")

router = APIRouter(prefix="/source-types", tags=["Source Types"])


@router.get("", response_model=SourceTypesResponse)
async def list_source_types(
    workspace: Workspace = Depends(get_current_workspace),
):
    """List all available source categories registered in this workspace."""
    types = list(workspace.source_types or DEFAULT_SOURCE_TYPES)
    return SourceTypesResponse(
        source_types=types,
        defaults=DEFAULT_SOURCE_TYPES,
    )


@router.post("", response_model=SourceTypesResponse, status_code=status.HTTP_201_CREATED)
async def add_source_type(
    body: SourceTypeCreate,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """
    Register a new source category in this workspace.

    Note: Ingesting data with an unregistered source_type will also auto-register it.
    """
    clean_name = normalize_source_type(body.name)
    if not clean_name:
        raise HTTPException(status_code=400, detail="Invalid source type name")

    types = await ensure_workspace_source_type(workspace, clean_name, session)
    await session.commit()
    await session.refresh(workspace)

    return SourceTypesResponse(
        source_types=types,
        defaults=DEFAULT_SOURCE_TYPES,
    )


@router.delete("/{name}", response_model=SourceTypesResponse)
async def delete_source_type(
    name: str,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Delete a custom source category from the workspace catalog (defaults cannot be removed)."""
    clean_name = normalize_source_type(name)
    if clean_name in DEFAULT_SOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot remove default system source type '{clean_name}'",
        )

    current = list(workspace.source_types or DEFAULT_SOURCE_TYPES)
    if clean_name not in current:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source type '{clean_name}' is not registered in this workspace",
        )

    current.remove(clean_name)
    workspace.source_types = current
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)

    return SourceTypesResponse(
        source_types=current,
        defaults=DEFAULT_SOURCE_TYPES,
    )

