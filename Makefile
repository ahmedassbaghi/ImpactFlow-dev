.PHONY: install dev migrate seed test lint

install:
	cd apps/backend && pip install -e ".[dev]"
	cd apps/frontend && npm install

dev:
	make -j2 dev-backend dev-frontend

dev-backend:
	cd apps/backend && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd apps/frontend && npm run dev

migrate:
	cd apps/backend && alembic upgrade head

seed:
	cd apps/backend && python scripts/seed_demo.py

test:
	cd apps/backend && pytest --cov=app tests/
	cd apps/frontend && npm run test

lint:
	cd apps/backend && ruff check . && ruff format --check .
	cd apps/frontend && npm run lint

generate-types:
	cd apps/frontend && npx openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts
