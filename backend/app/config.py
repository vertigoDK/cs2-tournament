from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "change-me-in-prod-please"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days — casual local use

    # Локально — SQLite-файл, на Vercel — Postgres (Neon) из переменной окружения.
    database_url: str = "sqlite:///./data/app.db"

    admin_username: str = "admin"
    admin_password: str = "admin123"


@lru_cache
def get_settings() -> Settings:
    return Settings()
