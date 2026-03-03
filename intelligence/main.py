"""
FieldConnect Intelligence Service

A standalone service for:
- Ingesting historical RFI and punch list data
- Extracting entities (trades, materials, brands, people, locations)
- Generating embeddings and building a similarity engine
- Matching new observations against historical data
- Phase-aware alerting based on project schedules
- Context-aware transcription improvement
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from config import settings
from api.routes_health import router as health_router
from api.routes_ingest import router as ingest_router
from api.routes_analyze import router as analyze_router
from api.routes_transcription import router as transcription_router
from api.routes_feedback import router as feedback_router
from api.routes_schedule import router as schedule_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - startup and shutdown."""
    # Startup
    logger.info("Starting FieldConnect Intelligence Service...")

    # Initialize database connection pool
    await db.init_db()

    # Run migrations
    try:
        await db.run_migrations()
        logger.info("Database migrations completed")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        # Continue anyway - migrations might have already been applied

    logger.info("Intelligence Service started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Intelligence Service...")
    await db.close_db()
    logger.info("Intelligence Service stopped")


# Create FastAPI app
app = FastAPI(
    title="FieldConnect Intelligence Service",
    description="AI-powered construction intelligence layer for historical data matching and alerts",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, tags=["health"])
app.include_router(ingest_router, prefix="/ingest", tags=["ingestion"])
app.include_router(analyze_router, prefix="/analyze", tags=["analysis"])
app.include_router(transcription_router, prefix="/transcription", tags=["transcription"])
app.include_router(feedback_router, prefix="/feedback", tags=["feedback"])
app.include_router(schedule_router, tags=["schedule"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
