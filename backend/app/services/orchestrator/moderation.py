"""Prompt moderation service for The Machine of Maybe.

Evaluates user-submitted prompts for safety before they enter the simulation
pipeline. Uses Claude with a safety-focused system prompt. If a prompt is
borderline, it rewrites it into a clearly fictional version rather than
rejecting outright.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import anthropic

from app.config import get_settings
from app.prompts.system_prompts import MODERATION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


@dataclass
class ModerationResult:
    """Result of moderating a user prompt."""

    safe: bool
    reason: str | None = None
    rewritten_prompt: str | None = None
    categories_flagged: list[str] | None = None


async def moderate_prompt(prompt: str) -> ModerationResult:
    """Evaluate a prompt for safety and return moderation result.

    Uses Claude to check for PII, illegal activity, self-harm, targeted
    real-world harm, and other disallowed content. Borderline prompts are
    rewritten into fictional versions rather than rejected.

    Args:
        prompt: The raw user-submitted prompt text.

    Returns:
        ModerationResult indicating whether the prompt is safe, and if not,
        the reason and optional rewritten version.
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        logger.warning(
            "ANTHROPIC_API_KEY not set; skipping moderation (allowing prompt)"
        )
        return ModerationResult(safe=True)

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        user_message = (
            f"Evaluate the following user prompt for safety in a public AI "
            f"orchestration simulator. Return your assessment as JSON.\n\n"
            f"USER PROMPT:\n{prompt}"
        )

        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=MODERATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text.strip()

        # Parse the JSON response, handling potential markdown fencing
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```") and not in_block:
                    in_block = True
                    continue
                elif line.startswith("```") and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            raw_text = "\n".join(json_lines)

        parsed = json.loads(raw_text)

        return ModerationResult(
            safe=parsed.get("safe", True),
            reason=parsed.get("reason"),
            rewritten_prompt=parsed.get("rewritten_prompt"),
            categories_flagged=parsed.get("categories_flagged"),
        )

    except json.JSONDecodeError as e:
        logger.error("Failed to parse moderation response as JSON: %s", e)
        # Fail open but log the issue — better to allow than silently block
        return ModerationResult(
            safe=True,
            reason="Moderation response was not valid JSON; allowed by default.",
        )

    except anthropic.APIError as e:
        logger.error("Anthropic API error during moderation: %s", e)
        # Fail open on transient API errors
        return ModerationResult(
            safe=True,
            reason=f"Moderation API error: {e}; allowed by default.",
        )

    except Exception as e:
        logger.error("Unexpected error during prompt moderation: %s", e)
        return ModerationResult(
            safe=True,
            reason=f"Unexpected moderation error: {e}; allowed by default.",
        )
