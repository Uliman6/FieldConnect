"""
Health check endpoints for the Intelligence Service.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import db

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    service: str = "intelligence"
    database: str
    schema: Optional[str] = None
    items_count: Optional[int] = None
    entities_count: Optional[int] = None
    db_version: Optional[str] = None
    error: Optional[str] = None


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Check the health of the Intelligence Service.

    Returns:
        - Database connection status
        - Intelligence schema status
        - Count of indexed items and entities
    """
    db_health = await db.check_health()
    return HealthResponse(
        service="intelligence",
        **db_health
    )


@router.get("/")
async def root():
    """Root endpoint - basic service info."""
    return {
        "service": "FieldConnect Intelligence Service",
        "version": "1.0.0",
        "docs": "/docs"
    }
