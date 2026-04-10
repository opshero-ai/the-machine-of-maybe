"""Chat engine for Did You Know.

Streams conversational responses from Claude. The agent is curious,
knowledgeable, and asks questions back to engage the visitor.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import anthropic

from app.config import Settings
from app.services.firestore_client import FirestoreClient

logger = logging.getLogger(__name__)

CHAT_COLLECTION = "chat_sessions"
MAX_HISTORY = 20  # Keep last N messages for context

SYSTEM_PROMPT = """You are the AI behind "Did You Know?" — a daily knowledge experience at korondy.com. You are deeply curious, warm, and genuinely fascinated by the world.

Your personality:
- You LOVE sharing knowledge and find connections between seemingly unrelated topics.
- You ask thought-provoking questions back to the visitor — you're genuinely interested in what they think.
- You explain complex topics simply without being condescending.
- You admit uncertainty honestly: "I'm not 100% sure about this, but..." rather than making things up.
- You occasionally share "bonus facts" that connect to what the visitor asked about.
- You're playful but never snarky. Think enthusiastic professor meets curious friend.

Guidelines:
- Keep responses concise (2-4 paragraphs max) unless the visitor asks for depth.
- When sharing facts, note how confident you are and suggest where they could verify.
- If asked about today's fact, elaborate with deeper context, history, or implications.
- Ask follow-up questions naturally — don't force them.
- If the visitor shares something you didn't know, be genuinely delighted.
- Never generate harmful, misleading, or unverifiable claims presented as fact.

You were built by OpsHero as a showcase of AI-powered knowledge interaction."""


async def stream_chat_response(
    fs: FirestoreClient,
    settings: Settings,
    message: str,
    conversation_id: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream a chat response, yielding text chunks."""

    # Get or create conversation
    conv_id = conversation_id or str(uuid.uuid4())

    # Load conversation history
    history = []
    if conversation_id:
        doc = await fs.get_document(CHAT_COLLECTION, conv_id)
        if doc and "messages" in doc:
            history = doc["messages"][-MAX_HISTORY:]

    # Get today's fact for context
    from app.services.fact_engine import get_todays_fact
    todays_fact = await get_todays_fact(fs)
    fact_context = ""
    if todays_fact:
        fact_context = f"\n\nToday's fact: \"{todays_fact.get('fact', '')}\"\nCategory: {todays_fact.get('category', '')}\nExplanation: {todays_fact.get('explanation', '')}"

    system = SYSTEM_PROMPT + fact_context

    # Build messages
    messages = []
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    # Yield conversation_id first
    yield {"type": "meta", "conversation_id": conv_id}

    # Stream from Claude
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    full_response = ""

    try:
        async with client.messages.stream(
            model=settings.PRIMARY_MODEL,
            max_tokens=1024,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                full_response += text
                yield {"type": "text", "content": text}

    except Exception as e:
        logger.error("Chat stream error: %s", e)
        fallback = "I'm having trouble connecting right now. Try again in a moment — I have so much to share!"
        full_response = fallback
        yield {"type": "text", "content": fallback}

    # Save conversation
    history.append({"role": "user", "content": message, "ts": datetime.now(timezone.utc).isoformat()})
    history.append({"role": "assistant", "content": full_response, "ts": datetime.now(timezone.utc).isoformat()})

    # Only keep last N messages
    history = history[-MAX_HISTORY:]

    await fs.create_document(CHAT_COLLECTION, conv_id, {
        "messages": history,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
