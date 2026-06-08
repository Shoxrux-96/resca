from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./dev.db"
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 60 * 24 * 7
    CORS_ORIGINS: str = "*"

    # Telegram bot webhook uchun public URL (masalan: https://resca.uz)
    # Telegram webhook public HTTPS URL talab qiladi.
    # Local test uchun ngrok yoki tunnel ishlating.
    PUBLIC_URL: str = "http://localhost:8000"

    # Web Push (VAPID)
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_EMAIL: str = "admin@resca.uz"


settings = Settings()

