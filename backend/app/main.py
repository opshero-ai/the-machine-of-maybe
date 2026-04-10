"""FastAPI application entry point for Did You Know API.

Daily facts researched and verified by AI, plus interactive chat.
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

_firestore_client: FirestoreClient | None = None


def get_firestore() -> FirestoreClient:
    """Return the shared Firestore client."""
    assert _firestore_client is not None, "Firestore not initialized"
    return _firestore_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _firestore_client
    settings = get_settings()
    _firestore_client = FirestoreClient(
        project_id=settings.PROJECT_ID,
        database=settings.FIRESTORE_DATABASE,
    )
    logger.info("Did You Know API starting — project=%s", settings.PROJECT_ID)
    yield
    logger.info("Did You Know API shutting down")


app = FastAPI(
    title="Did You Know API",
    version="1.0.0",
    description="Daily AI-researched facts and interactive knowledge chat.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "did-you-know-api", "version": "1.0.0"}
