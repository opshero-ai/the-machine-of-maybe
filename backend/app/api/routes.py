"""API routes for The Machine of Maybe.

All endpoints are prefixed with /api and handle scenario creation, run
management, SSE event streaming, decision gates, and feedback.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.config import Settings, get_settings
from app.models.entities import (
    CreateRunRequest,
    CreateScenarioRequest,
    DecisionGate,
    FeedbackRequest,
    GateStatus,
    ResolveGateRequest,
    Run,
    RunStatus,
    Scenario,
    ScenarioConstraints,
    ScenarioTemplate,
    SimulationMode,
    TemplateCategory,
)
from app.services.compiler.scenario_compiler import compile_scenario
from app.services.firestore_client import FirestoreClient
from app.services.orchestrator.engine import OrchestrationEngine
from app.services.orchestrator.moderation import moderate_prompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])

# ---------------------------------------------------------------------------
# Dependency injection
# ---------------------------------------------------------------------------

_firestore_client: FirestoreClient | None = None


def get_firestore() -> FirestoreClient:
    """Get the shared Firestore client instance."""
    global _firestore_client
    if _firestore_client is None:
        settings = get_settings()
        _firestore_client = FirestoreClient(
            project_id=settings.PROJECT_ID,
            database=settings.FIRESTORE_DATABASE,
        )
    return _firestore_client


# ---------------------------------------------------------------------------
# Active engine tracking (for gate resolution)
# ---------------------------------------------------------------------------

_active_engines: dict[str, OrchestrationEngine] = {}


# ---------------------------------------------------------------------------
# Built-in templates
# ---------------------------------------------------------------------------

BUILT_IN_TEMPLATES = [
    ScenarioTemplate(
        id="tmpl-startup-launch",
        title="Startup Product Launch",
        description="Plan and execute a product launch for a SaaS startup with a $50K budget and 4-week timeline.",
        category=TemplateCategory.BUSINESS,
        prompt="You are the founding team of a B2B SaaS startup launching your first product. You have a $50,000 marketing budget, a 4-week timeline, and a team of 5. The product is an AI-powered customer support tool. Plan the go-to-market strategy, coordinate engineering for launch readiness, and execute the launch.",
        constraints=ScenarioConstraints(
            time_pressure="4 weeks",
            budget="$50,000",
            team_size=5,
        ),
        difficulty="medium",
        estimated_duration="8-12 minutes",
        tags=["startup", "product-launch", "marketing", "go-to-market"],
    ),
    ScenarioTemplate(
        id="tmpl-data-center-outage",
        title="Data Center Outage Response",
        description="Respond to a major data center outage affecting 10,000 customers with an SLA of 99.9%.",
        category=TemplateCategory.CRISIS,
        prompt="A major cloud provider data center has gone offline, taking down your company's primary region. 10,000 enterprise customers are affected. Your SLA guarantees 99.9% uptime and you're now in breach. You have a DR plan but it's never been fully tested. Coordinate the incident response, communicate with customers, and restore service.",
        constraints=ScenarioConstraints(
            time_pressure="4 hours",
            team_size=12,
        ),
        difficulty="hard",
        estimated_duration="10-15 minutes",
        tags=["incident-response", "infrastructure", "crisis", "disaster-recovery"],
    ),
    ScenarioTemplate(
        id="tmpl-supply-chain",
        title="Global Supply Chain Disruption",
        description="Navigate a supply chain crisis when your primary supplier goes offline unexpectedly.",
        category=TemplateCategory.LOGISTICS,
        prompt="Your manufacturing company's primary component supplier (60% of materials) has suddenly halted operations due to a factory fire. You have 2 weeks of inventory remaining. 200 customer orders are in the pipeline. Find alternative suppliers, prioritize orders, manage customer expectations, and restructure your supply chain for resilience.",
        constraints=ScenarioConstraints(
            time_pressure="2 weeks",
            budget="$200,000",
        ),
        difficulty="hard",
        estimated_duration="10-15 minutes",
        tags=["supply-chain", "logistics", "crisis", "manufacturing"],
    ),
    ScenarioTemplate(
        id="tmpl-hospital-surge",
        title="Hospital Surge Capacity Planning",
        description="Plan for a 300% increase in emergency department volume during a regional health crisis.",
        category=TemplateCategory.HEALTHCARE,
        prompt="A regional health crisis is expected to triple your hospital's emergency department volume over the next 10 days. You need to plan surge capacity: staffing, bed allocation, supply procurement, triage protocols, and overflow facilities. Coordinate with city emergency services and neighboring hospitals.",
        constraints=ScenarioConstraints(
            time_pressure="10 days",
            team_size=25,
        ),
        difficulty="hard",
        estimated_duration="12-18 minutes",
        tags=["healthcare", "crisis", "capacity-planning", "emergency"],
    ),
    ScenarioTemplate(
        id="tmpl-platform-migration",
        title="Legacy Platform Migration",
        description="Migrate a monolithic application to microservices while maintaining zero downtime.",
        category=TemplateCategory.ENGINEERING,
        prompt="Your company's 8-year-old monolithic application needs to be migrated to a microservices architecture. The system handles 50,000 daily active users and processes $2M/day in transactions. You need zero downtime during migration. Plan the strangler fig pattern implementation, data migration strategy, testing approach, and rollback plan.",
        constraints=ScenarioConstraints(
            time_pressure="6 months",
            budget="$500,000",
            team_size=15,
        ),
        difficulty="medium",
        estimated_duration="10-15 minutes",
        tags=["engineering", "migration", "microservices", "architecture"],
    ),
    ScenarioTemplate(
        id="tmpl-film-production",
        title="Independent Film Production",
        description="Produce a 90-minute independent film from script to premiere on a tight budget.",
        category=TemplateCategory.CREATIVE,
        prompt="You're producing an independent film with a $100,000 budget and a 3-month production timeline. The script is locked. You need to handle casting, location scouting, crew hiring, equipment rental, a 20-day shoot schedule, post-production, festival submission, and marketing. Coordinate all departments to deliver on time and budget.",
        constraints=ScenarioConstraints(
            time_pressure="3 months",
            budget="$100,000",
            team_size=30,
        ),
        difficulty="medium",
        estimated_duration="10-15 minutes",
        tags=["creative", "film", "production", "project-management"],
    ),
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/scenarios", response_model=Scenario)
async def create_scenario(
    request: CreateScenarioRequest,
    settings: Settings = Depends(get_settings),
    firestore: FirestoreClient = Depends(get_firestore),
) -> Scenario:
    """Create a new scenario from a user prompt.

    1. Moderate the prompt for safety
    2. Create the scenario in Firestore
    3. Return the scenario object
    """
    # Moderate prompt
    moderation = await moderate_prompt(request.prompt)

    if not moderation.safe:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "prompt_rejected",
                "reason": moderation.reason,
                "categories": moderation.categories_flagged,
            },
        )

    # Use rewritten prompt if available
    final_prompt = moderation.rewritten_prompt or request.prompt

    scenario = Scenario(
        prompt=final_prompt,
        constraints=request.constraints,
        moderated=moderation.rewritten_prompt is not None,
        moderation_note=(
            "Prompt was rewritten for safety." if moderation.rewritten_prompt else None
        ),
    )

    # Persist to Firestore
    try:
        await firestore.create_document(
            "scenarios",
            scenario.id,
            scenario.model_dump(mode="json"),
        )
    except Exception as e:
        logger.error("Failed to create scenario in Firestore: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create scenario.")

    logger.info("Created scenario %s", scenario.id)
    return scenario


@router.post("/runs", response_model=Run)
async def create_run(
    request: CreateRunRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    firestore: FirestoreClient = Depends(get_firestore),
) -> Run:
    """Create a simulation run for a scenario and start orchestration.

    1. Verify scenario exists
    2. Create the run in Firestore
    3. Kick off orchestration in a background task
    4. Return the run object immediately
    """
    # Verify scenario exists
    scenario_data = await firestore.get_document("scenarios", request.scenario_id)
    if scenario_data is None:
        raise HTTPException(status_code=404, detail="Scenario not found.")

    scenario = Scenario(**scenario_data)

    # Create run
    run = Run(
        scenario_id=request.scenario_id,
        mode=request.mode,
        status=RunStatus.PENDING,
    )

    try:
        await firestore.create_document(
            "runs",
            run.id,
            run.model_dump(mode="json"),
        )
    except Exception as e:
        logger.error("Failed to create run in Firestore: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create run.")

    # Kick off orchestration in background
    background_tasks.add_task(
        _run_orchestration,
        run_id=run.id,
        scenario=scenario,
        mode=request.mode,
        firestore=firestore,
    )

    logger.info("Created run %s for scenario %s", run.id, request.scenario_id)
    return run


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    firestore: FirestoreClient = Depends(get_firestore),
) -> dict[str, Any]:
    """Get the current state of a simulation run.

    Returns the run document plus agents, tasks, and gates.
    """
    run_data = await firestore.get_document("runs", run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Run not found.")

    # Fetch subcollections
    agents = await firestore.query_subcollection("runs", run_id, "agents")
    tasks = await firestore.query_subcollection("runs", run_id, "tasks")
    gates = await firestore.query_subcollection("runs", run_id, "gates")

    return {
        "run": run_data,
        "agents": agents,
        "tasks": tasks,
        "gates": gates,
    }


@router.get("/runs/{run_id}/events")
async def stream_events(
    run_id: str,
    request: Request,
    firestore: FirestoreClient = Depends(get_firestore),
) -> EventSourceResponse:
    """SSE endpoint streaming events for a simulation run.

    Streams existing events, then keeps the connection open for new events.
    """
    # Verify run exists
    run_data = await firestore.get_document("runs", run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Run not found.")

    async def event_generator():
        """Generate SSE events from Firestore."""
        last_sequence = -1

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            try:
                # Query events after last_sequence
                events = await firestore.query_subcollection(
                    "runs",
                    run_id,
                    "events",
                    order_by="sequence",
                )

                for event in events:
                    seq = event.get("sequence", 0)
                    if seq > last_sequence:
                        last_sequence = seq
                        yield {
                            "event": event.get("event_type", "unknown"),
                            "id": str(seq),
                            "data": json.dumps(event, default=str),
                        }

                # Check if run is terminal
                run_state = await firestore.get_document("runs", run_id)
                if run_state:
                    status = run_state.get("status", "")
                    if status in (
                        RunStatus.COMPLETED.value,
                        RunStatus.FAILED.value,
                        RunStatus.CANCELLED.value,
                    ):
                        # Send final status event
                        yield {
                            "event": "run_complete",
                            "data": json.dumps(
                                {"status": status, "run": run_state}, default=str
                            ),
                        }
                        break

                # Poll interval
                await asyncio.sleep(2)

            except Exception as e:
                logger.error("Error streaming events for run %s: %s", run_id, e)
                yield {
                    "event": "error",
                    "data": json.dumps({"error": str(e)}),
                }
                break

    return EventSourceResponse(event_generator())


@router.post("/runs/{run_id}/approve")
async def resolve_gate(
    run_id: str,
    request: ResolveGateRequest,
    firestore: FirestoreClient = Depends(get_firestore),
) -> dict[str, str]:
    """Resolve a decision gate with the user's chosen option."""
    # Verify run exists
    run_data = await firestore.get_document("runs", run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Run not found.")

    # Get the gate
    gate_data = await firestore.get_subcollection_doc(
        "runs", run_id, "gates", request.gate_id
    )
    if gate_data is None:
        raise HTTPException(status_code=404, detail="Decision gate not found.")

    if gate_data.get("status") != GateStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Gate is already {gate_data.get('status')}.",
        )

    # Resolve the gate in Firestore
    await firestore.update_subcollection_doc(
        "runs",
        run_id,
        "gates",
        request.gate_id,
        {
            "status": GateStatus.RESOLVED.value,
            "selected_option": request.selected_option,
            "resolved_at": datetime.utcnow().isoformat(),
        },
    )

    # If there's an active engine, resolve in-memory too
    engine = _active_engines.get(run_id)
    if engine:
        await engine.resolve_gate(
            request.gate_id,
            request.selected_option,
            request.reasoning or "",
        )

    logger.info(
        "Resolved gate %s for run %s: %s",
        request.gate_id,
        run_id,
        request.selected_option,
    )

    return {"status": "resolved", "gate_id": request.gate_id}


@router.post("/runs/{run_id}/remix", response_model=Run)
async def remix_run(
    run_id: str,
    constraints: ScenarioConstraints,
    background_tasks: BackgroundTasks,
    firestore: FirestoreClient = Depends(get_firestore),
) -> Run:
    """Create a new run with modified constraints based on an existing run.

    Reuses the original scenario's prompt but applies new constraints.
    """
    # Get original run
    run_data = await firestore.get_document("runs", run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Original run not found.")

    # Get original scenario
    scenario_data = await firestore.get_document(
        "scenarios", run_data["scenario_id"]
    )
    if scenario_data is None:
        raise HTTPException(status_code=404, detail="Original scenario not found.")

    # Create new scenario with modified constraints
    new_scenario = Scenario(
        prompt=scenario_data["prompt"],
        constraints=constraints,
    )

    await firestore.create_document(
        "scenarios",
        new_scenario.id,
        new_scenario.model_dump(mode="json"),
    )

    # Create new run
    new_run = Run(
        scenario_id=new_scenario.id,
        mode=SimulationMode(run_data.get("mode", SimulationMode.GUIDED.value)),
        status=RunStatus.PENDING,
    )

    await firestore.create_document(
        "runs",
        new_run.id,
        new_run.model_dump(mode="json"),
    )

    # Kick off orchestration
    background_tasks.add_task(
        _run_orchestration,
        run_id=new_run.id,
        scenario=new_scenario,
        mode=new_run.mode,
        firestore=firestore,
    )

    logger.info("Created remix run %s from original %s", new_run.id, run_id)
    return new_run


@router.get("/templates", response_model=list[ScenarioTemplate])
async def list_templates() -> list[ScenarioTemplate]:
    """Return built-in scenario templates."""
    return BUILT_IN_TEMPLATES


@router.post("/feedback")
async def submit_feedback(
    request: FeedbackRequest,
    firestore: FirestoreClient = Depends(get_firestore),
) -> dict[str, str]:
    """Store user feedback for a simulation run."""
    # Verify run exists
    run_data = await firestore.get_document("runs", request.run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Run not found.")

    try:
        await firestore.create_document(
            "feedback",
            f"fb-{request.run_id}-{int(datetime.utcnow().timestamp())}",
            request.model_dump(mode="json"),
        )
    except Exception as e:
        logger.error("Failed to store feedback: %s", e)
        raise HTTPException(status_code=500, detail="Failed to store feedback.")

    logger.info("Stored feedback for run %s: rating=%d", request.run_id, request.rating)
    return {"status": "received", "run_id": request.run_id}


# ---------------------------------------------------------------------------
# Background orchestration runner
# ---------------------------------------------------------------------------


async def _run_orchestration(
    run_id: str,
    scenario: Scenario,
    mode: SimulationMode,
    firestore: FirestoreClient,
) -> None:
    """Background task that compiles the scenario and runs orchestration.

    This is called via BackgroundTasks so it runs after the HTTP response
    is sent.
    """
    try:
        # Update status to compiling
        await firestore.update_document(
            "runs",
            run_id,
            {"status": RunStatus.COMPILING.value, "current_phase": "Compiling scenario"},
        )

        # Compile the scenario
        logger.info("Compiling scenario for run %s", run_id)
        compiled = await compile_scenario(scenario.prompt, scenario.constraints)
        logger.info(
            "Compilation complete: %d tasks, %d roles, confidence=%.2f",
            len(compiled.task_graph),
            len(compiled.required_roles),
            compiled.confidence,
        )

        # Create and run the engine
        engine = OrchestrationEngine(
            run_id=run_id,
            scenario=scenario,
            compiled=compiled,
            mode=mode,
            firestore=firestore,
        )

        # Track engine for gate resolution
        _active_engines[run_id] = engine

        try:
            outcome = await engine.execute()
            logger.info(
                "Run %s completed: score=%.2f, %d events",
                run_id,
                outcome.success_score,
                engine.event_sequence,
            )
        finally:
            # Clean up engine reference
            _active_engines.pop(run_id, None)

    except Exception as e:
        logger.error("Orchestration failed for run %s: %s", run_id, e)
        try:
            await firestore.update_document(
                "runs",
                run_id,
                {
                    "status": RunStatus.FAILED.value,
                    "error": str(e),
                    "completed_at": datetime.utcnow().isoformat(),
                },
            )
        except Exception as update_err:
            logger.error("Failed to update run %s status: %s", run_id, update_err)
