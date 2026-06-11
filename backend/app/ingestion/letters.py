"""Parse the PDF letters from external agents into plain text.

We only extract text here. Pulling structured *claims* out of the free text
(which entities are named, what mandate dates they assert, what contradicts the
register) is left to the LLM layer — that's exactly the kind of messy
unstructured-to-structured job an LLM is good at, and keeping it separate makes
the AI's contribution easy to point to.
"""

from __future__ import annotations

from pathlib import Path

import pdfplumber

# Best-effort provider attribution from the filename.
_PROVIDER_BY_HINT = {
    "luxembourg": "Lux Corporate Management",
    "singapore": "Pacific Corporate Advisory",
    "netherlands": "Van der Berg Corporate Services",
}

from ..models import Letter


def _guess_provider(filename: str) -> str | None:
    low = filename.lower()
    for hint, provider in _PROVIDER_BY_HINT.items():
        if hint in low:
            return provider
    return None


def load_letters(letters_dir: Path) -> list[Letter]:
    letters: list[Letter] = []
    for pdf_path in sorted(Path(letters_dir).glob("*.pdf")):
        pages: list[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
        letters.append(
            Letter(
                filename=pdf_path.name,
                provider=_guess_provider(pdf_path.name),
                text="\n".join(pages).strip(),
            )
        )
    return letters
