"""Central configuration.

Everything time-sensitive (overdue filings, expiring mandates) is computed
against a single `as_of_date`. It defaults to the real current date but can be
pinned via the AS_OF_DATE env var so a demo stays reproducible and never
silently changes meaning as days pass.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo layout: <root>/backend/app/config.py  ->  root is parents[2]
ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / "backend" / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Treat empty env vars as unset. Without this, an empty ANTHROPIC_API_KEY
        # exported in the shell would shadow the real key in .env (process env
        # takes priority over the .env file).
        env_ignore_empty=True,
    )

    # LLM
    llm_provider: str = "mock"  # "mock" | "anthropic"
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-haiku-4-5-20251001"

    # Time
    as_of_date: Optional[date] = None

    # Data paths
    subsidiaries_csv: Path = DATA_DIR / "subsidiaries.csv"
    board_updates_json: Path = DATA_DIR / "board_updates.json"
    letters_dir: Path = DATA_DIR / "letters"

    # Risk thresholds
    mandate_warning_days: int = 30  # mandate expiring within N days -> warning

    @field_validator("as_of_date", "anthropic_api_key", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        # A blank value in .env (e.g. `AS_OF_DATE=`) arrives as "" — treat any
        # blank optional field as unset rather than failing validation.
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @property
    def today(self) -> date:
        return self.as_of_date or date.today()


settings = Settings()
