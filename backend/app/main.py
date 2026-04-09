"""FastAPI application entry point for The Machine of Maybe API.

Public AI orchestration simulator. Provides scenario compilation, multi-agent
simulation execution, SSE event streaming, and decision gates.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.config import get_settings
from app.services.firestore_client import FirestoreClient

logger = logging.getLogger(__name__)

# Shared Firestore client initialized at startup
_firestore_client: FirestoreClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    global _firestore_client

    settings = get_settings()

    # Initialize Firestore client
    _firestore_client = FirestoreClient(
        project_id=settings.PROJECT_ID,
        database=settings.FIRESTORE_DATABASE,
    )

    logger.info(
        "Machine of Maybe API starting — project=%s, primary_model=%s, fallback_model=%s",
        settings.PROJECT_ID,
        settings.PRIMARY_MODEL,
        settings.FALLBACK_MODEL,
    )

    yield

    logger.info("Machine of Maybe API shutting down")


app = FastAPI(
    title="The Machine of Maybe API",
    version="0.1.0",
    description=(
        "Public AI orchestration simulator. Submit a scenario, watch AI agents "
        "collaborate to solve it in real-time, and make key decisions at gate points."
    ),
    lifespan=lifespan,
)

# CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for Cloud Run / load balancer probes."""
    return {
        "status": "healthy",
        "service": "machine-of-maybe-api",
        "version": "0.1.0",
    }
