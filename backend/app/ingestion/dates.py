"""Tolerant date parsing.

board_updates.json mixes formats: "15 May 2026", "2026-05-31", "05/25/2026".
dateutil handles all three. We default to month-first for ambiguous numeric
dates (the data uses US-style MM/DD/YYYY), and return None rather than raising
when a value is genuinely unparseable.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from dateutil import parser as _dateutil


def parse_date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return _dateutil.parse(text, dayfirst=False).date()
    except (ValueError, OverflowError, TypeError):
        return None
