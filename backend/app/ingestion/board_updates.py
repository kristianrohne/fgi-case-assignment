"""Load board_updates.json and match each entry back to the register.

Names in the inbox are messy ("FGI- Copenhagen Retail VII ApS" vs.
"FGI Copenhagen Retail VII ApS"), so matching is fuzzy. Anything that can't be
matched above a confidence threshold is left unmatched — those become the
"ghost entity" findings downstream. We flag rather than guess.
"""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path

from ..models import BoardUpdate, Entity
from .dates import parse_date

# Confidence floor for accepting a fuzzy name match (0-100).
MATCH_THRESHOLD = 85.0

_LEGAL_SUFFIXES = re.compile(
    r"\b(s\.?à\.?\s*r\.?\s*l\.?|b\.?v\.?|gmbh|s\.?l\.?|s\.?a\.?|aps|ab|ltd|"
    r"co\.?\s*ltd|llc|corp\.?|plc|pte\.?\s*ltd|inc\.?|nv|oy|as|asa)\b",
    re.IGNORECASE,
)


def normalize_name(name: str | None) -> str:
    """Lowercase, drop legal suffixes and punctuation, collapse whitespace."""
    if not name:
        return ""
    text = name.lower()
    text = _LEGAL_SUFFIXES.sub(" ", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def load_board_updates(json_path: Path) -> list[BoardUpdate]:
    raw = json.loads(Path(json_path).read_text(encoding="utf-8"))
    updates: list[BoardUpdate] = []
    for item in raw:
        date_raw = item.get("date")
        updates.append(
            BoardUpdate(
                date_raw=date_raw,
                date_parsed=parse_date(date_raw),
                entity_name=item.get("entity_name"),
                change_type=item.get("change_type"),
                details=item.get("details"),
                source=item.get("source"),
            )
        )
    return updates


def _similarity(a: str, b: str) -> float:
    """Token-aware similarity in 0-100 using stdlib difflib.

    We blend a whole-string ratio with a token-set ratio so word-order and
    extra tokens ("FGI- Copenhagen Retail VII" vs "FGI Copenhagen Retail VII")
    still score high — the bit of WRatio we actually need here.
    """
    whole = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    token = len(ta & tb) / len(ta | tb) if (ta and tb) else 0.0
    return max(whole, token) * 100


def match_updates(updates: list[BoardUpdate], entities: list[Entity]) -> None:
    """Resolve each update to an entity_id in place (best fuzzy match)."""
    norm_to_id: dict[str, str] = {}
    norm_to_name: dict[str, str] = {}
    for ent in entities:
        norm = normalize_name(ent.entity_name)
        if norm:
            norm_to_id.setdefault(norm, ent.entity_id)
            norm_to_name.setdefault(norm, ent.entity_name or ent.entity_id)

    for upd in updates:
        target = normalize_name(upd.entity_name)
        if not target:
            continue
        scored = sorted(
            ((norm, _similarity(target, norm)) for norm in norm_to_id),
            key=lambda x: x[1], reverse=True,
        )
        best_norm, best_score = scored[0] if scored else (None, 0.0)
        upd.match_score = best_score
        upd.match_candidates = [
            {"entity_id": norm_to_id[n], "entity_name": norm_to_name[n], "score": round(s, 1)}
            for n, s in scored[:5]
        ]
        if best_norm is not None and best_score >= MATCH_THRESHOLD:
            upd.matched_entity_id = norm_to_id[best_norm]
            upd.matched = True
