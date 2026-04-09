"""Firestore client wrapper for The Machine of Maybe.

Provides async CRUD operations for all collections:
- scenarios
- runs
- runs/{run_id}/agents
- runs/{run_id}/tasks
- runs/{run_id}/events
- runs/{run_id}/gates
- outcomes
- feedback
- templates
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, AsyncIterator

from google.cloud.firestore_v1 import AsyncClient, async_client

logger = logging.getLogger(__name__)


class FirestoreClient:
    """Async Firestore client with lazy initialization."""

    def __init__(self, project_id: str, database: str = "(default)") -> None:
        self._project_id = project_id
        self._database = database
        self._client: AsyncClient | None = None

    @property
    def client(self) -> AsyncClient:
        """Lazily initialize the Firestore AsyncClient."""
        if self._client is None:
            self._client = AsyncClient(
                project=self._project_id,
                database=self._database,
            )
            logger.info(
                "Initialized Firestore AsyncClient for project=%s, database=%s",
                self._project_id,
                self._database,
            )
        return self._client

    async def create_document(
        self,
        collection: str,
        doc_id: str,
        data: dict[str, Any],
    ) -> None:
        """Create a document in a top-level collection.

        Args:
            collection: Collection name (e.g. "scenarios").
            doc_id: Document ID.
            data: Document data.
        """
        try:
            data = _serialize_datetimes(data)
            await self.client.collection(collection).document(doc_id).set(data)
            logger.debug("Created %s/%s", collection, doc_id)
        except Exception as e:
            logger.error("Failed to create %s/%s: %s", collection, doc_id, e)
            raise

    async def get_document(
        self,
        collection: str,
        doc_id: str,
    ) -> dict[str, Any] | None:
        """Get a document by ID from a top-level collection.

        Returns:
            Document data as dict, or None if not found.
        """
        try:
            doc = await self.client.collection(collection).document(doc_id).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            logger.error("Failed to get %s/%s: %s", collection, doc_id, e)
            raise

    async def update_document(
        self,
        collection: str,
        doc_id: str,
        data: dict[str, Any],
    ) -> None:
        """Update (merge) fields on an existing document.

        Args:
            collection: Collection name.
            doc_id: Document ID.
            data: Fields to update/merge.
        """
        try:
            data = _serialize_datetimes(data)
            await self.client.collection(collection).document(doc_id).update(data)
            logger.debug("Updated %s/%s", collection, doc_id)
        except Exception as e:
            logger.error("Failed to update %s/%s: %s", collection, doc_id, e)
            raise

    async def query_collection(
        self,
        collection: str,
        filters: list[tuple[str, str, Any]] | None = None,
        order_by: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Query a top-level collection with optional filters, ordering, and limit.

        Args:
            collection: Collection name.
            filters: List of (field, operator, value) tuples.
            order_by: Field name to order by (ascending).
            limit: Maximum number of results.

        Returns:
            List of document dicts.
        """
        try:
            query = self.client.collection(collection)

            if filters:
                for field, op, value in filters:
                    query = query.where(field, op, value)

            if order_by:
                query = query.order_by(order_by)

            if limit:
                query = query.limit(limit)

            results = []
            async for doc in query.stream():
                results.append(doc.to_dict())

            return results
        except Exception as e:
            logger.error("Failed to query %s: %s", collection, e)
            raise

    async def add_subcollection_doc(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        data: dict[str, Any],
        doc_id: str | None = None,
    ) -> str:
        """Add a document to a subcollection.

        Args:
            parent_collection: Parent collection name (e.g. "runs").
            parent_id: Parent document ID.
            subcollection: Subcollection name (e.g. "events").
            data: Document data.
            doc_id: Optional explicit document ID; auto-generated if None.

        Returns:
            The document ID of the created document.
        """
        try:
            data = _serialize_datetimes(data)
            parent_ref = self.client.collection(parent_collection).document(parent_id)
            sub_ref = parent_ref.collection(subcollection)

            if doc_id:
                await sub_ref.document(doc_id).set(data)
                logger.debug(
                    "Created %s/%s/%s/%s",
                    parent_collection,
                    parent_id,
                    subcollection,
                    doc_id,
                )
                return doc_id
            else:
                _, doc_ref = await sub_ref.add(data)
                logger.debug(
                    "Created %s/%s/%s/%s",
                    parent_collection,
                    parent_id,
                    subcollection,
                    doc_ref.id,
                )
                return doc_ref.id
        except Exception as e:
            logger.error(
                "Failed to add to %s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                e,
            )
            raise

    async def get_subcollection_doc(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        doc_id: str,
    ) -> dict[str, Any] | None:
        """Get a document from a subcollection.

        Returns:
            Document data as dict, or None if not found.
        """
        try:
            doc = (
                await self.client.collection(parent_collection)
                .document(parent_id)
                .collection(subcollection)
                .document(doc_id)
                .get()
            )
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            logger.error(
                "Failed to get %s/%s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                doc_id,
                e,
            )
            raise

    async def update_subcollection_doc(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        doc_id: str,
        data: dict[str, Any],
    ) -> None:
        """Update a document in a subcollection."""
        try:
            data = _serialize_datetimes(data)
            await (
                self.client.collection(parent_collection)
                .document(parent_id)
                .collection(subcollection)
                .document(doc_id)
                .update(data)
            )
            logger.debug(
                "Updated %s/%s/%s/%s",
                parent_collection,
                parent_id,
                subcollection,
                doc_id,
            )
        except Exception as e:
            logger.error(
                "Failed to update %s/%s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                doc_id,
                e,
            )
            raise

    async def query_subcollection(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        filters: list[tuple[str, str, Any]] | None = None,
        order_by: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Query a subcollection with optional filters, ordering, and limit.

        Returns:
            List of document dicts.
        """
        try:
            query = (
                self.client.collection(parent_collection)
                .document(parent_id)
                .collection(subcollection)
            )

            if filters:
                for field, op, value in filters:
                    query = query.where(field, op, value)

            if order_by:
                query = query.order_by(order_by)

            if limit:
                query = query.limit(limit)

            results = []
            async for doc in query.stream():
                results.append(doc.to_dict())

            return results
        except Exception as e:
            logger.error(
                "Failed to query %s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                e,
            )
            raise

    async def stream_subcollection(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        order_by: str = "sequence",
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream all documents from a subcollection, ordered.

        Yields:
            Document dicts in order.
        """
        try:
            query = (
                self.client.collection(parent_collection)
                .document(parent_id)
                .collection(subcollection)
                .order_by(order_by)
            )

            async for doc in query.stream():
                yield doc.to_dict()
        except Exception as e:
            logger.error(
                "Failed to stream %s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                e,
            )
            raise

    async def count_subcollection(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
    ) -> int:
        """Count documents in a subcollection.

        Returns:
            Number of documents.
        """
        try:
            query = (
                self.client.collection(parent_collection)
                .document(parent_id)
                .collection(subcollection)
            )
            count = 0
            async for _ in query.stream():
                count += 1
            return count
        except Exception as e:
            logger.error(
                "Failed to count %s/%s/%s: %s",
                parent_collection,
                parent_id,
                subcollection,
                e,
            )
            raise


def _serialize_datetimes(data: dict[str, Any]) -> dict[str, Any]:
    """Convert datetime objects to ISO strings for Firestore compatibility.

    Firestore natively handles datetime objects, but we normalize to ensure
    consistent serialization when data passes through Pydantic .model_dump().
    """
    result = {}
    for key, value in data.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = _serialize_datetimes(value)
        elif isinstance(value, list):
            result[key] = [
                _serialize_datetimes(v) if isinstance(v, dict) else v for v in value
            ]
        else:
            result[key] = value
    return result
