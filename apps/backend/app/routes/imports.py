"""JSON import endpoints."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import ImportLog, User
from app.services.import_service import (
    IMPORT_FORMAT_EXAMPLE,
    commit_import,
    preview_import,
    validate_references,
    validate_structure,
)
from app.utils.deps import require_roles

settings = get_settings()
router = APIRouter(prefix=settings.api_prefix, tags=["imports"])


class ImportPayload(BaseModel):
    data: dict[str, Any]
    source_filename: str | None = None


@router.get("/imports/format")
async def get_import_format() -> dict:
    return {"description": "Format esperat del fitxer JSON", "example": IMPORT_FORMAT_EXAMPLE}


@router.post("/imports/validate")
async def validate_import(
    payload: ImportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> dict:
    errors = validate_structure(payload.data)
    warnings: list[str] = []
    if not errors:
        ref_errors, warnings = await validate_references(
            db, current_user.organization_id, payload.data
        )
        errors = ref_errors
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


@router.post("/imports/preview")
async def preview_import_endpoint(
    payload: ImportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> dict:
    return await preview_import(db, current_user.organization_id, payload.data)


@router.post("/imports/commit")
async def commit_import_endpoint(
    payload: ImportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> dict:
    result = await commit_import(
        db,
        current_user.organization_id,
        current_user.id,
        payload.data,
        payload.source_filename,
    )
    if result.get("status") == "failed":
        raise HTTPException(status_code=400, detail=result)
    return result


@router.get("/imports/history")
async def import_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "coordinator")),
) -> list[dict]:
    result = await db.execute(
        select(ImportLog)
        .where(ImportLog.organization_id == current_user.organization_id)
        .order_by(ImportLog.imported_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "imported_at": log.imported_at.isoformat(),
            "source_filename": log.source_filename,
            "status": log.status,
            "summary": json.loads(log.summary_json),
        }
        for log in logs
    ]
