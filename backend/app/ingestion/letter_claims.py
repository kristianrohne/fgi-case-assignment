"""Turn free-text agent letters into structured, register-matched claims.

This is deliberately a *deterministic* first pass (regex + token scan) so the
feature works with no API key. It extracts every "FGI ..." entity mention, the
dates and status words in its immediate context, and resolves it against the
register with the same fuzzy matcher used for the board-update inbox.

The LLM layer then sits on top as a semantic validator — its job is to catch
the false matches this naive layer cannot (e.g. "Aurora *Storage* Holdings"
fuzzy-matching "Aurora *Solar* Holdings" at 90+). Keeping the deterministic
extraction visible makes that AI contribution concrete and measurable.
"""

from __future__ import annotations

import re

from ..models import Entity, Letter, LetterClaim
from .board_updates import _similarity, normalize_name

MATCH_THRESHOLD = 85.0

# Tokens that mark the end of a legal name (include the token, then stop).
_SUFFIX_TOKENS = {
    "r.l.", "b.v.", "ltd.", "ltd", "gmbh", "s.l.", "pte.", "corp.", "corp",
    "llc", "ab", "aps", "inc.", "inc", "co.",
}
_ROMAN = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"}

_STATUS_TERMS = ["overdue", "pending", "on track", "dissolved", "wound up", "liquidation"]
_ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def _extract_name_at(tokens: list[str], start: int) -> tuple[str, bool]:
    """Greedily consume a legal-entity name beginning at tokens[start]=='FGI'.

    Returns (name, complete) where `complete` is True only if the name ended on
    a legal suffix or a roman-numeral ordinal — i.e. it looks like a real entity
    name rather than a prose fragment ("FGI Netherlands entities ...").
    """
    name = [tokens[start]]
    i = start + 1
    complete = False
    while i < len(tokens):
        tok = tokens[i]
        low = tok.lower().rstrip(",")
        if low in _SUFFIX_TOKENS:  # legal suffix -> end of name
            name.append(tok)
            complete = True
            break
        if low in _ROMAN:  # sequence ordinal -> end of name
            name.append(tok.rstrip(","))
            complete = True
            break
        if tok == "&" or (tok[:1].isalpha() and tok[:1].isupper()):
            name.append(tok)
            i += 1
            continue
        break
    return " ".join(name).strip(" ,"), complete


def _topic(letter_text: str) -> str:
    low = letter_text.lower()
    if "mandate" in low:
        return "mandate"
    if "filing" in low or "annual return" in low:
        return "filing"
    if "dissolved" in low or "wound up" in low:
        return "status"
    return "other"


def extract_claims(letter: Letter) -> list[LetterClaim]:
    topic = _topic(letter.text)
    claims: list[LetterClaim] = []
    seen: set[str] = set()

    for line in letter.text.splitlines():
        tokens = line.split()
        for idx, tok in enumerate(tokens):
            if tok != "FGI":
                continue
            name, complete = _extract_name_at(tokens, idx)
            # Only keep names that look like real legal entities, not prose.
            if not complete or len(name.split()) < 2 or name in seen:
                continue
            seen.add(name)
            claims.append(
                LetterClaim(
                    letter_filename=letter.filename,
                    provider=letter.provider,
                    topic=topic,
                    entity_name_raw=name,
                    context=line.strip(),
                    claimed_dates=_ISO_DATE.findall(line),
                    claimed_status_terms=[
                        t for t in _STATUS_TERMS if t in line.lower()
                    ],
                )
            )
    return claims


def match_claims(claims: list[LetterClaim], entities: list[Entity]) -> None:
    norm_to_id: dict[str, str] = {}
    norm_to_name: dict[str, str] = {}
    for ent in entities:
        norm = normalize_name(ent.entity_name)
        if norm:
            norm_to_id.setdefault(norm, ent.entity_id)
            norm_to_name.setdefault(norm, ent.entity_name or ent.entity_id)

    for claim in claims:
        target = normalize_name(claim.entity_name_raw)
        if not target:
            continue
        scored = sorted(
            ((norm, _similarity(target, norm)) for norm in norm_to_id),
            key=lambda x: x[1], reverse=True,
        )
        best_norm, best_score = scored[0] if scored else (None, 0.0)
        claim.match_score = best_score
        claim.match_candidates = [
            {"entity_id": norm_to_id[n], "entity_name": norm_to_name[n], "score": round(s, 1)}
            for n, s in scored[:5]
        ]
        if best_norm is not None and best_score >= MATCH_THRESHOLD:
            claim.matched_entity_id = norm_to_id[best_norm]
            claim.matched = True
