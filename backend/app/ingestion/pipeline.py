"""Orchestrate ingestion: load all three sources, match the inbox, return a
single bundle the rest of the app reads from.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..config import settings
from ..models import BoardUpdate, Entity, Letter
from .board_updates import load_board_updates, match_updates
from .entities import load_entities
from .letter_claims import extract_claims, match_claims
from .letters import load_letters


@dataclass
class IngestResult:
    entities: list[Entity] = field(default_factory=list)
    board_updates: list[BoardUpdate] = field(default_factory=list)
    letters: list[Letter] = field(default_factory=list)

    @property
    def by_id(self) -> dict[str, Entity]:
        return {e.entity_id: e for e in self.entities}


def ingest() -> IngestResult:
    entities = load_entities(settings.subsidiaries_csv)
    updates = load_board_updates(settings.board_updates_json)
    match_updates(updates, entities)
    letters = load_letters(settings.letters_dir)
    for letter in letters:
        letter.claims = extract_claims(letter)
        match_claims(letter.claims, entities)
    return IngestResult(entities=entities, board_updates=updates, letters=letters)
