"""Topic CRUD endpoints scoped to the active workspace."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Topic, UpdatePolicy, Workspace
from ..schemas import TopicCreate, TopicRead, TopicUpdate
from ..security import get_current_workspace

router = APIRouter(prefix="/topics", tags=["Topics"])

SENSITIVE_TOPIC_KEYWORDS = (
    "allergy",
    "allergies",
    "medical",
    "health",
    "dietary_restriction",
    "budget",
    "salary",
    "security",
    "compliance",
)


def _is_sensitive_topic(name: str) -> bool:
    slug = name.strip().lower()
    return any(kw in slug for kw in SENSITIVE_TOPIC_KEYWORDS)


@router.post("", response_model=TopicRead, status_code=201)
async def create_topic(
    body: TopicCreate,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Create a new topic (attribute schema) to track in the active workspace."""
    existing = await session.execute(
        select(Topic).where(
            Topic.workspace_id == workspace.id,
            Topic.name == body.name,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=409,
            detail=f"Topic '{body.name}' already exists in this workspace",
        )

    effective_policy = body.update_policy
    if "update_policy" not in body.model_fields_set and _is_sensitive_topic(body.name):
        effective_policy = UpdatePolicy.REVIEW

    topic = Topic(
        workspace_id=workspace.id,
        name=body.name,
        description=body.description,
        data_type=body.data_type,
        cardinality=body.cardinality,
        update_policy=effective_policy,
        temporal=body.temporal,
        enum_values=body.enum_values,
        schema_version=1,
    )
    session.add(topic)
    await session.commit()
    await session.refresh(topic)
    return TopicRead(**topic.model_dump())


@router.get("", response_model=list[TopicRead])
async def list_topics(
    active_only: bool = Query(True),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List all topics in the active workspace."""
    query = select(Topic).where(Topic.workspace_id == workspace.id).order_by(Topic.name)
    if active_only:
        query = query.where(Topic.is_active == True)

    result = await session.execute(query)
    return [TopicRead(**t.model_dump()) for t in result.scalars().all()]


@router.put("/{topic_id}", response_model=TopicRead)
async def update_topic(
    topic_id: int,
    body: TopicUpdate,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Update a topic and increment its schema version."""
    topic = await session.get(Topic, topic_id)
    if not topic or topic.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Topic not found")

    update_data = body.model_dump(exclude_unset=True)
    schema_changed = any(
        k in update_data for k in ("data_type", "cardinality", "update_policy", "enum_values")
    )
    for key, value in update_data.items():
        setattr(topic, key, value)

    if schema_changed:
        topic.schema_version = (topic.schema_version or 1) + 1

    await session.commit()
    await session.refresh(topic)
    return TopicRead(**topic.model_dump())


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate a topic (soft-delete)."""
    topic = await session.get(Topic, topic_id)
    if not topic or topic.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.is_active = False
    await session.commit()
