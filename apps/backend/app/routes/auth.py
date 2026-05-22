"""Autenticació pública: login i registre."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Organization, User
from app.schemas.api import LoginRequest, RegisterRequest, RegisterResponse, TokenResponse
from app.utils.auth import create_token, get_password_hash, verify_password

settings = get_settings()
router = APIRouter(tags=["auth"])


def _resolve_login_query(login_raw: str):
    login_id = login_raw.strip().lower()
    if "@" in login_id:
        return select(User).where(User.email == login_id)
    return select(User).where(User.username == login_id)


@router.post(f"{settings.api_prefix}/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user_result = await db.execute(_resolve_login_query(payload.login))
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active or user.role == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte pendent d'activació per un coordinador",
        )

    access_token = create_token(user.id, "access", {"role": user.role, "org_id": user.organization_id})
    refresh_token = create_token(user.id, "refresh")
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        user_id=user.id,
    )


@router.post(
    f"{settings.api_prefix}/auth/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> RegisterResponse:
    org_result = await db.execute(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organització no trobada")

    username_norm = payload.username.strip().lower()
    existing_email = await db.execute(select(User).where(User.email == payload.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aquest email ja està registrat")

    existing_username = await db.execute(
        select(User).where(
            User.organization_id == org.id,
            User.username == username_norm,
        )
    )
    if existing_username.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aquest nom d'usuari ja existeix")

    user = User(
        organization_id=org.id,
        email=str(payload.email).lower(),
        username=username_norm,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        role="pending",
        is_active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return RegisterResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        username=user.username or username_norm,
        message="Compte creat. Un coordinador l'ha d'activar abans que puguis entrar.",
    )
