"""API routes for Did You Know.

Endpoints:
  GET  /api/fact/today     — Today's fact (generates if missing)
  POST /api/fact/generate  — Force-generate today's fact (scheduler)
  GET  /api/facts/archive  — Past facts
  POST /api/chat           — SSE streaming chat with the AI agent
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.services.fact_engine import generate_daily_fact, get_todays_fact, get_fact_archive
from app.services.chat_engine import stream_chat_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ─── Models ───

class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


# ─── Fact Endpoints ───

@router.get("/fact/today")
async def fact_today(request: Request):
    """Return today's fact. Generates one if it doesn't exist yet."""
    from app.main import get_firestore
    fs = get_firestore()
    settings = get_settings()

    fact = await get_todays_fact(fs)
    if fact is None:
        # Generate on-demand if scheduler hasn't run yet
        fact = await generate_daily_fact(fs, settings)

    return {"fact": fact}


@router.post("/fact/generate")
async def fact_generate(request: Request):
    """Force-generate today's fact. Called by Cloud Scheduler daily."""
    from app.main import get_firestore
    fs = get_firestore()
    settings = get_settings()

    fact = await generate_daily_fact(fs, settings)
    return {"fact": fact, "generated": True}


@router.get("/facts/archive")
async def facts_archive(request: Request, limit: int = 30):
    """Return past facts, most recent first."""
    from app.main import get_firestore
    fs = get_firestore()

    facts = await get_fact_archive(fs, limit=min(limit, 100))
    return {"facts": facts}


# ─── Chat Endpoint ───

@router.post("/chat")
async def chat(request: Request, body: ChatRequest):
    """Stream a chat response from the AI agent via SSE."""
    from app.main import get_firestore
    fs = get_firestore()
    settings = get_settings()

    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    async def event_generator():
        try:
            async for chunk in stream_chat_response(
                fs=fs,
                settings=settings,
                message=body.message,
                conversation_id=body.conversation_id,
            ):
                yield {"event": "message", "data": json.dumps(chunk)}
            yield {"event": "done", "data": "{}"}
        except Exception as e:
            logger.error("Chat stream error: %s", e)
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
