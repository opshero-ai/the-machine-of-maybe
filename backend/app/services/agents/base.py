"""Base agent class for The Machine of Maybe.

Provides the core think/act loop with LLM integration. All concrete agent
roles inherit from BaseAgent and customize their system prompt and context
scoping.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import anthropic
import openai

from app.config import get_settings
from app.models.entities import AgentAction, AgentResult, AgentRole, AgentState

logger = logging.getLogger(__name__)


class BaseAgent:
    """Base class for all simulation agents.

    Each agent has a role, a unique name, and a system prompt that shapes
    its LLM behavior. The think/act loop is:
    1. think(context) -> AgentAction — analyze context, decide what to do
    2. act(action) -> AgentResult — execute the decided action
    """

    def __init__(
        self,
        role: AgentRole,
        name: str,
        run_id: str,
        system_prompt: str,
        capabilities: list[str] | None = None,
    ) -> None:
        self.role = role
        self.name = name
        self.run_id = run_id
        self.system_prompt = system_prompt
        self.capabilities = capabilities or []
        self.state = AgentState.IDLE
        self.actions_taken = 0
        self._settings = get_settings()

    async def think(self, context: dict[str, Any]) -> AgentAction:
        """Analyze the current context and decide on an action.

        Uses the primary LLM (Claude Opus 4.6) to reason about the given
        context and produce a structured AgentAction. Falls back to GPT-5.4
        if the primary model is unavailable.

        Args:
            context: Dict containing relevant state — current task, run state,
                     other agents' outputs, etc.

        Returns:
            An AgentAction describing what to do next.
        """
        self.state = AgentState.THINKING

        context_text = self._format_context(context)
        user_message = (
            f"You are {self.name} ({self.role.value}). Analyze the following context "
            f"and decide your next action.\n\n"
            f"CONTEXT:\n{context_text}\n\n"
            f"Respond with a JSON object:\n"
            f'{{"action_type": "execute_task|review|escalate|narrate|design", '
            f'"target_task_id": "task ID or null", '
            f'"reasoning": "your step-by-step reasoning", '
            f'"details": {{...role-specific output...}}}}'
        )

        raw = await self._call_llm(user_message)

        if raw is None:
            logger.error("[%s] LLM call failed; returning no-op action", self.name)
            return AgentAction(
                action_type="execute_task",
                reasoning="LLM call failed; proceeding with default action.",
                details={"error": "LLM unavailable"},
            )

        try:
            parsed = _extract_json_from_text(raw)
            return AgentAction(
                action_type=parsed.get("action_type", "execute_task"),
                target_task_id=parsed.get("target_task_id"),
                reasoning=parsed.get("reasoning", ""),
                details=parsed.get("details", {}),
            )
        except Exception as e:
            logger.error("[%s] Failed to parse think() output: %s", self.name, e)
            return AgentAction(
                action_type="execute_task",
                reasoning=f"Failed to parse LLM output: {e}",
                details={"raw_output": raw[:500]},
            )

    async def act(self, action: AgentAction) -> AgentResult:
        """Execute an action and return the result.

        For the base agent, acting means calling the LLM again with the
        action plan to produce detailed execution output. Concrete agent
        roles may override this for specialized behavior.

        Args:
            action: The AgentAction to execute.

        Returns:
            An AgentResult with the execution outcome.
        """
        self.state = AgentState.ACTING
        start_time = time.monotonic()

        user_message = (
            f"You are {self.name} ({self.role.value}). Execute the following action "
            f"and provide detailed results.\n\n"
            f"ACTION TYPE: {action.action_type}\n"
            f"TARGET TASK: {action.target_task_id or 'N/A'}\n"
            f"REASONING: {action.reasoning}\n"
            f"DETAILS: {json.dumps(action.details, indent=2)}\n\n"
            f"Respond with a JSON object containing your execution results. "
            f"Include all relevant output for your role."
        )

        raw = await self._call_llm(user_message)
        duration = time.monotonic() - start_time

        if raw is None:
            self.state = AgentState.ERROR
            return AgentResult(
                success=False,
                error="LLM call failed during action execution.",
                duration_seconds=duration,
            )

        try:
            parsed = _extract_json_from_text(raw)
            self.actions_taken += 1
            self.state = AgentState.IDLE
            return AgentResult(
                success=True,
                output=parsed,
                duration_seconds=duration,
            )
        except Exception as e:
            logger.error("[%s] Failed to parse act() output: %s", self.name, e)
            self.actions_taken += 1
            self.state = AgentState.IDLE
            return AgentResult(
                success=True,
                output={"raw_output": raw[:2000]},
                duration_seconds=duration,
            )

    async def _call_llm(self, user_message: str) -> str | None:
        """Call the primary LLM, falling back to the secondary on failure.

        Args:
            user_message: The user-role message to send.

        Returns:
            Raw text response, or None if both models fail.
        """
        # Try Anthropic (primary)
        result = await self._call_anthropic(user_message)
        if result is not None:
            return result

        # Fallback to OpenAI
        logger.warning("[%s] Anthropic failed; falling back to OpenAI", self.name)
        return await self._call_openai(user_message)

    async def _call_anthropic(self, user_message: str) -> str | None:
        """Call Claude Opus 4.6."""
        if not self._settings.ANTHROPIC_API_KEY:
            return None

        try:
            client = anthropic.AsyncAnthropic(
                api_key=self._settings.ANTHROPIC_API_KEY,
            )
            response = await client.messages.create(
                model=self._settings.PRIMARY_MODEL,
                max_tokens=4096,
                system=self.system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            return response.content[0].text.strip()

        except anthropic.APIError as e:
            logger.error("[%s] Anthropic API error: %s", self.name, e)
            return None
        except Exception as e:
            logger.error("[%s] Unexpected Anthropic error: %s", self.name, e)
            return None

    async def _call_openai(self, user_message: str) -> str | None:
        """Call GPT-5.4 as fallback."""
        if not self._settings.OPENAI_API_KEY:
            return None

        try:
            client = openai.AsyncOpenAI(api_key=self._settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model=self._settings.FALLBACK_MODEL,
                max_completion_tokens=4096,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_message},
                ],
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content.strip()

        except openai.APIError as e:
            logger.error("[%s] OpenAI API error: %s", self.name, e)
            return None
        except Exception as e:
            logger.error("[%s] Unexpected OpenAI error: %s", self.name, e)
            return None

    def _format_context(self, context: dict[str, Any]) -> str:
        """Format a context dict into a readable string for the LLM.

        Subclasses can override this to scope context to their role.
        """
        parts = []
        for key, value in context.items():
            if isinstance(value, (dict, list)):
                parts.append(f"{key}:\n{json.dumps(value, indent=2, default=str)}")
            else:
                parts.append(f"{key}: {value}")
        return "\n\n".join(parts)

    def to_dict(self) -> dict[str, Any]:
        """Serialize agent state for Firestore storage."""
        return {
            "role": self.role.value,
            "name": self.name,
            "run_id": self.run_id,
            "state": self.state.value,
            "capabilities": self.capabilities,
            "actions_taken": self.actions_taken,
        }


def _extract_json_from_text(text: str) -> dict:
    """Extract a JSON object from LLM text output.

    Handles markdown code fencing and leading/trailing text.
    """
    text = text.strip()

    # Handle markdown fencing
    if "```" in text:
        lines = text.split("\n")
        json_lines = []
        in_block = False
        for line in lines:
            if line.strip().startswith("```") and not in_block:
                in_block = True
                continue
            elif line.strip().startswith("```") and in_block:
                break
            elif in_block:
                json_lines.append(line)
        if json_lines:
            text = "\n".join(json_lines)

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object boundaries
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON from text: {text[:200]}")
