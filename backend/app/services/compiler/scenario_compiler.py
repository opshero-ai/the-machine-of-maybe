"""Scenario compiler service for The Machine of Maybe.

Transforms raw user prompts + constraints into fully structured scenario
specifications (CompiledScenario) using Claude Opus 4.6. Falls back to
GPT-5.4 if Anthropic is unavailable.
"""

from __future__ import annotations

import json
import logging

import anthropic
import openai

from app.config import get_settings
from app.models.entities import (
    AgentRole,
    CompiledScenario,
    CompiledTaskNode,
    RiskEntry,
    RiskLevel,
    ScenarioConstraints,
)
from app.prompts.system_prompts import COMPILER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# JSON schema description sent alongside the prompt to enforce structure
_OUTPUT_SCHEMA_DESCRIPTION = """\
Return a JSON object with exactly these fields:
{
    "scenario_summary": "2-3 sentence summary of the scenario",
    "domain": "business|logistics|engineering|healthcare|crisis|creative|other",
    "scenario_type": "planning|response|optimization|investigation|design|other",
    "goals": ["primary goal 1", "primary goal 2"],
    "subgoals": ["measurable subgoal 1", ...],
    "constraints": ["constraint description 1", ...],
    "assumptions": ["assumption 1", ...],
    "risks": [
        {"title": "...", "level": "low|medium|high|critical", "description": "...", "materialized": false, "mitigation": "..."}
    ],
    "task_graph": [
        {
            "id": "task-1",
            "title": "Task title",
            "description": "What this task involves",
            "assigned_role": "architect|analyst|operator|guardian|escalation_lead|narrator",
            "dependencies": [],
            "estimated_duration": "30 minutes",
            "risk_level": "low|medium|high|critical",
            "acceptance_criteria": ["criterion 1", ...]
        }
    ],
    "required_roles": ["architect", "analyst", "operator", "guardian", "escalation_lead", "narrator"],
    "human_review_points": ["description of decision point requiring human input"],
    "success_metrics": ["metric 1", "metric 2"],
    "safety_flags": ["any safety concern for this simulation"],
    "confidence": 0.85
}

The task_graph MUST form a valid DAG. Each task's dependencies array contains
IDs of tasks that must complete before it can start. Aim for 8-20 tasks.
Assign each task to the most appropriate agent role.
"""


async def compile_scenario(
    prompt: str,
    constraints: ScenarioConstraints,
) -> CompiledScenario:
    """Compile a user prompt into a structured scenario specification.

    Uses Claude Opus 4.6 as the primary model, with GPT-5.4 as fallback.

    Args:
        prompt: The raw user prompt describing the scenario.
        constraints: User-specified constraints (time, budget, risk, etc.).

    Returns:
        A fully structured CompiledScenario ready for orchestration.

    Raises:
        RuntimeError: If both primary and fallback LLMs fail.
    """
    settings = get_settings()

    constraint_text = _format_constraints(constraints)

    user_message = (
        f"Compile the following scenario into a structured execution plan.\n\n"
        f"USER PROMPT:\n{prompt}\n\n"
        f"CONSTRAINTS:\n{constraint_text}\n\n"
        f"OUTPUT FORMAT:\n{_OUTPUT_SCHEMA_DESCRIPTION}"
    )

    # Try primary model (Claude Opus 4.6)
    raw_json = await _call_anthropic(settings, user_message)

    # Fallback to OpenAI if Anthropic fails
    if raw_json is None:
        logger.warning("Anthropic failed; falling back to OpenAI %s", settings.FALLBACK_MODEL)
        raw_json = await _call_openai(settings, user_message)

    if raw_json is None:
        raise RuntimeError(
            "Both primary (Anthropic) and fallback (OpenAI) LLMs failed to compile scenario."
        )

    # Parse and validate
    return _parse_compiled_scenario(raw_json)


async def _call_anthropic(settings, user_message: str) -> dict | None:
    """Call Claude Opus 4.6 for scenario compilation."""
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set; skipping Anthropic call")
        return None

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        response = await client.messages.create(
            model=settings.PRIMARY_MODEL,
            max_tokens=8192,
            system=COMPILER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text.strip()
        return _extract_json(raw_text)

    except anthropic.APIError as e:
        logger.error("Anthropic API error during compilation: %s", e)
        return None
    except Exception as e:
        logger.error("Unexpected Anthropic error during compilation: %s", e)
        return None


async def _call_openai(settings, user_message: str) -> dict | None:
    """Call GPT-5.4 as fallback for scenario compilation."""
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set; skipping OpenAI fallback")
        return None

    try:
        client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        response = await client.chat.completions.create(
            model=settings.FALLBACK_MODEL,
            max_completion_tokens=8192,
            messages=[
                {"role": "system", "content": COMPILER_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content.strip()
        return _extract_json(raw_text)

    except openai.APIError as e:
        logger.error("OpenAI API error during compilation: %s", e)
        return None
    except Exception as e:
        logger.error("Unexpected OpenAI error during compilation: %s", e)
        return None


def _extract_json(raw_text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown fencing."""
    # Strip markdown code fencing if present
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
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
        text = "\n".join(json_lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM output as JSON: %s\nRaw: %s", e, text[:500])
        return None


def _parse_compiled_scenario(data: dict) -> CompiledScenario:
    """Parse raw JSON dict into a validated CompiledScenario.

    Handles missing fields gracefully with sensible defaults.
    """
    # Parse risks
    risks = []
    for r in data.get("risks", []):
        try:
            risks.append(
                RiskEntry(
                    title=r.get("title", "Unknown risk"),
                    level=RiskLevel(r.get("level", "medium")),
                    description=r.get("description", ""),
                    materialized=r.get("materialized", False),
                    mitigation=r.get("mitigation"),
                )
            )
        except (ValueError, KeyError) as e:
            logger.warning("Skipping malformed risk entry: %s — %s", r, e)

    # Parse task graph
    task_graph = []
    for t in data.get("task_graph", []):
        try:
            task_graph.append(
                CompiledTaskNode(
                    id=t.get("id", ""),
                    title=t.get("title", "Untitled task"),
                    description=t.get("description", ""),
                    assigned_role=AgentRole(t.get("assigned_role", "operator")),
                    dependencies=t.get("dependencies", []),
                    estimated_duration=t.get("estimated_duration"),
                    risk_level=RiskLevel(t.get("risk_level", "low")),
                    acceptance_criteria=t.get("acceptance_criteria", []),
                )
            )
        except (ValueError, KeyError) as e:
            logger.warning("Skipping malformed task node: %s — %s", t, e)

    # Parse required roles
    required_roles = []
    for role_str in data.get("required_roles", []):
        try:
            required_roles.append(AgentRole(role_str))
        except ValueError:
            logger.warning("Unknown role in required_roles: %s", role_str)

    # Clamp confidence
    confidence = data.get("confidence", 0.5)
    confidence = max(0.0, min(1.0, float(confidence)))

    return CompiledScenario(
        scenario_summary=data.get("scenario_summary", ""),
        domain=data.get("domain", "other"),
        scenario_type=data.get("scenario_type", "planning"),
        goals=data.get("goals", []),
        subgoals=data.get("subgoals", []),
        constraints=data.get("constraints", []),
        assumptions=data.get("assumptions", []),
        risks=risks,
        task_graph=task_graph,
        required_roles=required_roles,
        human_review_points=data.get("human_review_points", []),
        success_metrics=data.get("success_metrics", []),
        safety_flags=data.get("safety_flags", []),
        confidence=confidence,
    )


def _format_constraints(constraints: ScenarioConstraints) -> str:
    """Format constraints into human-readable text for the LLM prompt."""
    parts = []
    if constraints.time_pressure:
        parts.append(f"- Time pressure: {constraints.time_pressure}")
    if constraints.budget:
        parts.append(f"- Budget: {constraints.budget}")
    if constraints.team_size:
        parts.append(f"- Maximum team size: {constraints.team_size}")
    parts.append(f"- Risk tolerance: {constraints.risk_tolerance.value}")
    if constraints.custom:
        for key, value in constraints.custom.items():
            parts.append(f"- {key}: {value}")
    return "\n".join(parts) if parts else "No specific constraints."
