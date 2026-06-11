# AI usage log

The brief encouraged using AI tools and asked us to be ready to discuss *where
they helped and where we had to step in*. This is that log — honest about both.

**Primary tool:** Claude Code (Claude Opus) as a pair-programmer, driving the
build from the terminal. **Approach:** I used AI aggressively for breadth and
speed, but treated every factual claim it made as something to verify against
the data, and I owned the architectural decisions.

---

## Where AI clearly helped

- **Exploratory data analysis.** AI scaffolded a notebook ([`notebooks/eda.ipynb`](notebooks/eda.ipynb))
  that profiled the 100-entity register — missing values, jurisdiction/status
  distributions, ownership anomalies — far faster than I'd have written by hand.
- **Anomaly hunting.** It surfaced candidate data-quality issues to investigate:
  the circular ownership pair, the fabricated jurisdiction "Noveria", a 2027
  incorporation date, an orphan parent, a duplicate entity name, a blank name.
  I then verified each one directly in the CSV before trusting it.
- **Scaffolding & boilerplate.** The FastAPI app, Pydantic models, the React +
  Tailwind frontend, and the LLM client interface were generated quickly, which
  let me spend my attention on the risk logic.
- **Turning the messy letters into structure.** The PDF letters are free text;
  AI helped design the extraction that pulls each "FGI …" mention, its asserted
  dates/status, and matches it back to the register.

## Where I had to step in

- **AI overstated a fact in its own summary.** The LLM-written digest claimed
  *"two circular ownership loops"*. The deterministic detectors find exactly
  **one** (FGI-012 ↔ FGI-019). This is the core reason I designed the system so
  the **rules compute the facts and the LLM only narrates them** — the numbers
  on the dashboard come from code, not the model, so this kind of embellishment
  can't mislead the reader.
- **I rejected letting AI "fix" the data.** It would have been easy to have the
  model correct bad rows. I deliberately chose **flag, never auto-correct** —
  for a legal/governance tool, silently mutating a register is the wrong default.
- **Toolchain judgement (Python version).** The first dependency install failed
  because the machine's default Python was 3.14 (bleeding edge) and a package
  had no wheel for it. I made the call to rebuild on **Python 3.11** for
  portability — the reviewers have to run this on their machines — and dropped
  the compiled fuzzy-matching dependency in favour of the stdlib `difflib`.
- **A real config bug, found by reasoning not by the model.** After I added my
  API key to `backend/.env`, it wasn't picked up. The cause was an **empty
  `ANTHROPIC_API_KEY` already exported in my shell**, which takes priority over
  `.env`. Fixed by telling pydantic-settings to ignore empty env vars. Good
  reminder that "the AI wrote it" doesn't mean the environment is clean.
- **Verifying the detectors against the brief's hints.** My overdue-filing
  detector flags **15** entities; an earlier manual count had **14**. On
  inspection the detector was right — it also catches an entity whose *due date*
  has passed even though its status label wasn't "Overdue". I kept the broader,
  more correct rule.
- **The fuzzy-matching false-positive insight.** Naive name matching scores
  "Aurora **Storage** Holdings" against "Aurora **Solar** Holdings" at ~88, and
  "Singapore **Solar** III" against "Singapore **Hotel** III" at 87 — both above
  any sane threshold. These are *different businesses*. I added a check that
  flags a high-scoring match as a likely misidentification when the
  distinguishing word differs, so the tool doesn't quietly reconcile a ghost
  entity to the wrong record. (Building the tests also surfaced that there are
  *two* "Aurora Solar Holdings" entities — a GmbH and a S.à r.l. — which is why
  the match can land on either; the point stands.)

## Honest assessment

AI was excellent at breadth, boilerplate, and turning unstructured text into
structure — it compressed days of typing into hours. It was *not* reliable for
exact counts or for trusting messy data at face value, which is precisely why
the trustworthy parts of this tool (the findings) are deterministic and the AI
is confined to explaining and recommending. The interesting engineering was in
drawing that line.

*(The raw, unedited working log of the build is kept at
[`documents/promt_log.md`](documents/promt_log.md).)*
