"""Demo seed endpoint (production-gated)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
settings = get_settings()
router = APIRouter(prefix=settings.api_prefix, tags=["demo"])


@router.post("/demo/seed")
async def demo_seed() -> dict:
    if not settings.demo_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo mode is disabled",
        )
    try:
        from scripts.seed_demo import seed

        await seed()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Seed failed: {exc}",
        ) from exc
    return {"seeded": True, "message": "Demo data created"}
