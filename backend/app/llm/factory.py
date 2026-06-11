"""Pick the LLM implementation from config, with a safe fallback to mock."""

from __future__ import annotations

import logging

from ..config import settings
from .base import LLMClient
from .mock import MockLLMClient

log = logging.getLogger(__name__)


def get_llm_client() -> LLMClient:
    provider = (settings.llm_provider or "mock").lower()
    if provider == "anthropic":
        try:
            from .anthropic_client import AnthropicLLMClient

            return AnthropicLLMClient()
        except Exception as exc:  # missing key / package -> don't break the app
            log.warning("Anthropic client unavailable (%s); falling back to mock.", exc)
            return MockLLMClient()
    return MockLLMClient()
