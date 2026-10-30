"""Topic CRUD endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Topic
from ..schemas import TopicCreate, TopicRead, TopicUpdate

router = APIRouter(prefix="/topics", tags=["Topics"])


@router.post("", response_model=TopicRead, status_code=201)
async def create_topic(body: TopicCreate, session: AsyncSession = Depends(get_session)):
    """Create a new topic (attribute category) to track."""
    existing = await session.execute(select(Topic).where(Topic.name == body.name))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Topic '{body.name}' already exists")

    topic = Topic(
        name=body.name,
        description=body.description,
        data_type=body.data_type,
        enum_values=body.enum_values,
    )
    session.add(topic)
    await session.commit()
    await session.refresh(topic)
    return TopicRead(**topic.model_dump())


@router.get("", response_model=list[TopicRead])
async def list_topics(
    active_only: bool = Query(True),
    session: AsyncSession = Depends(get_session),
):
    """List all topics."""
    query = select(Topic).order_by(Topic.name)
    if active_only:
        query = query.where(Topic.is_active == True)

    result = await session.execute(query)
    return [TopicRead(**t.model_dump()) for t in result.scalars().all()]


@router.put("/{topic_id}", response_model=TopicRead)
async def update_topic(
    topic_id: int,
    body: TopicUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update a topic."""
    topic = await session.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(topic, key, value)

    await session.commit()
    await session.refresh(topic)
    return TopicRead(**topic.model_dump())


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(topic_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a topic (soft-delete by deactivating)."""
    topic = await session.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.is_active = False
    await session.commit()
