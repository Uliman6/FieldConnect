"""
Ingestion endpoints for the Intelligence Service.
Handles bulk import of RFIs, punch lists, and schedules.
"""

from fastapi import APIRouter

router = APIRouter()

# TODO: Implement in Session 2-3
# POST /items - Upload CSV/Excel/JSON of RFIs or punch list items
# POST /schedule - Upload a project schedule
# POST /single - Ingest a single new observation
# POST /reprocess/{project_id} - Re-run extraction and embeddings
# POST /catch-up/{company_id} - Re-index items not yet in intelligence DB
