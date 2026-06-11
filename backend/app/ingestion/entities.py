"""Load the subsidiary register (subsidiaries.csv) into Entity models.

Tolerant by design: a malformed date or number becomes None (with the raw
string preserved) instead of failing the load. Detecting those problems is a
downstream job, not the loader's.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from ..models import Entity
from .dates import parse_date


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _parse_float(value: Optional[str]) -> Optional[float]:
    text = _clean(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_members(value: Optional[str]) -> list[str]:
    text = _clean(value)
    if not text:
        return []
    return [m.strip() for m in text.split(",") if m.strip()]


def load_entities(csv_path: Path) -> list[Entity]:
    entities: list[Entity] = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            inc_raw = _clean(row.get("incorporation_date"))
            mandate_raw = _clean(row.get("board_mandate_expiry"))
            filing_raw = _clean(row.get("annual_filing_due"))
            entities.append(
                Entity(
                    entity_id=_clean(row.get("entity_id")) or "",
                    entity_name=_clean(row.get("entity_name")),
                    entity_type=_clean(row.get("entity_type")),
                    jurisdiction=_clean(row.get("jurisdiction")),
                    incorporation_date=parse_date(inc_raw),
                    incorporation_date_raw=inc_raw,
                    parent_entity_id=_clean(row.get("parent_entity_id")),
                    ownership_pct=_parse_float(row.get("ownership_pct")),
                    registered_address=_clean(row.get("registered_address")),
                    board_members=_parse_members(row.get("board_members")),
                    board_mandate_expiry=parse_date(mandate_raw),
                    board_mandate_expiry_raw=mandate_raw,
                    annual_filing_due=parse_date(filing_raw),
                    annual_filing_due_raw=filing_raw,
                    annual_filing_status=_clean(row.get("annual_filing_status")),
                    registered_agent=_clean(row.get("registered_agent")),
                    status=_clean(row.get("status")),
                    asset_class=_clean(row.get("asset_class")),
                    asset_description=_clean(row.get("asset_description")),
                )
            )
    return entities
