"""Afegeix sessions fins a 30 per alumne (sense esborrar les existents)."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Organization
from app.services.data_simulation_service import get_simulation_status, run_session_simulation


async def main() -> None:
    async with SessionLocal() as db:
        org = (await db.execute(select(Organization).limit(1))).scalar_one()
        org_id = org.id
        before = await get_simulation_status(db, org_id)
        print("Abans:", before)

        result = await run_session_simulation(
            db,
            organization_id=org_id,
            target_sessions_per_participant=30,
            clear_existing_sessions=False,
            span_weeks=30,
            absence_rate=0.04,
            random_seed=20260520,
        )

        after = await get_simulation_status(db, org_id)
        print("Resultat:", result)
        print("Després:", after)


if __name__ == "__main__":
    asyncio.run(main())
