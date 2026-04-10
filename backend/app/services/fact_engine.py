"""Fact generation engine.

Generates a verified, fascinating daily fact using Claude with research prompts.
Facts are stored in Firestore keyed by date (YYYY-MM-DD).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import anthropic

from app.config import Settings
from app.services.firestore_client import FirestoreClient

logger = logging.getLogger(__name__)

FACT_COLLECTION = "daily_facts"

GENERATION_PROMPT = """You are a world-class researcher and science communicator. Your job is to produce ONE fascinating, verified "Did You Know?" fact for today.

Requirements:
1. The fact must be TRUE and verifiable. Do not fabricate or exaggerate.
2. It should be genuinely surprising — something most educated adults wouldn't know.
3. It should span diverse topics: science, history, nature, technology, psychology, geography, space, medicine, art, or culture. Vary the category each day.
4. Include a brief explanation (2-3 sentences) of WHY this fact is true and what makes it interesting.
5. Include a thought-provoking follow-up question to engage the reader.
6. Rate how mind-blowing this fact is on a scale of 1-10.

Respond in this exact JSON format:
{
  "fact": "The core fact in one clear sentence.",
  "category": "science|history|nature|technology|psychology|geography|space|medicine|art|culture",
  "explanation": "2-3 sentences explaining the fact and why it's fascinating.",
  "source_hint": "A brief note on where this can be verified (e.g., 'Published in Nature, 2023' or 'NASA JPL data').",
  "follow_up_question": "A thought-provoking question for the reader related to this fact.",
  "mind_blown_rating": 8,
  "related_facts": [
    "A short related fact #1",
    "A short related fact #2"
  ]
}

Today's date: {date}
Previous recent categories (avoid repeating): {recent_categories}

Generate something truly remarkable."""


async def get_todays_fact(fs: FirestoreClient) -> dict[str, Any] | None:
    """Retrieve today's fact from Firestore, or None if not yet generated."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await fs.get_document(FACT_COLLECTION, today)
    return doc


async def generate_daily_fact(fs: FirestoreClient, settings: Settings) -> dict[str, Any]:
    """Generate today's fact using Claude, store it, and return it."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check if already exists
    existing = await fs.get_document(FACT_COLLECTION, today)
    if existing:
        return existing

    # Get recent categories to avoid repetition
    recent = await get_fact_archive(fs, limit=7)
    recent_categories = ", ".join(f.get("category", "unknown") for f in recent) or "none"

    # Generate via Claude
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    prompt = GENERATION_PROMPT.format(date=today, recent_categories=recent_categories)

    try:
        response = await client.messages.create(
            model=settings.PRIMARY_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        # Handle markdown fenced JSON
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        fact_data = json.loads(text)
    except Exception as e:
        logger.error("Fact generation failed: %s", e)
        fact_data = {
            "fact": "The human brain can store approximately 2.5 petabytes of information — roughly equivalent to 3 million hours of TV recordings.",
            "category": "science",
            "explanation": "This estimate comes from the number of synaptic connections in the brain (approximately 100 trillion) and the information capacity of each synapse. It's a rough estimate, but it highlights the extraordinary storage capacity of biological neural networks compared to digital systems.",
            "source_hint": "Salk Institute research on synaptic information storage capacity",
            "follow_up_question": "If our brains can store so much, why do we forget things so easily?",
            "mind_blown_rating": 7,
            "related_facts": [
                "Your brain uses about 20% of your body's total energy despite being only 2% of your weight.",
                "The brain generates enough electricity to power a small LED light bulb."
            ],
        }

    # Enrich and store
    fact_data["date"] = today
    fact_data["generated_at"] = datetime.now(timezone.utc).isoformat()

    await fs.create_document(FACT_COLLECTION, today, fact_data)
    logger.info("Generated fact for %s: category=%s", today, fact_data.get("category"))

    return fact_data


async def get_fact_archive(fs: FirestoreClient, limit: int = 30) -> list[dict[str, Any]]:
    """Return past facts ordered by date descending."""
    docs = await fs.query_collection(
        FACT_COLLECTION,
        filters=[],
        order_by="date",
        limit=limit,
    )
    # Sort descending (query_collection orders ascending)
    docs.sort(key=lambda d: d.get("date", ""), reverse=True)
    return docs
