"""
Configuration and settings for the FieldConnect Intelligence Service.
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from openai import OpenAI, AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = ""

    # OpenAI
    openai_api_key: str = ""

    # Model choices
    embedding_model: str = "text-embedding-3-small"  # 1536 dimensions
    extraction_model: str = "gpt-4o-mini"  # Fast, cheap entity extraction
    summary_model: str = "gpt-4o-mini"  # Alert abstraction

    # Service settings
    environment: str = "development"
    debug: bool = True

    # CORS
    cors_origins: list[str] = ["*"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def get_openai_client() -> OpenAI:
    """Get OpenAI client instance (synchronous)."""
    settings = get_settings()
    return OpenAI(api_key=settings.openai_api_key)


def get_async_openai_client() -> AsyncOpenAI:
    """Get OpenAI client instance (async)."""
    settings = get_settings()
    return AsyncOpenAI(api_key=settings.openai_api_key)


# Convenience exports
settings = get_settings()
openai_client = get_openai_client() if settings.openai_api_key else None
async_openai_client = None  # Created on demand to avoid event loop issues
