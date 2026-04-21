from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite+aiosqlite:///./impactflow.db"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    openai_api_key: str | None = None
    environment: str = "development"
    api_prefix: str = "/api/v1"
    auth_bypass: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
