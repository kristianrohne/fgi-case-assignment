# Tools: 
Claude Code (terminal), Claude.ai (chat), ChatGPT (second opinion), VS Code, and a personal notebook for ideas, problems and decisions along the way.

# Phase 1 — Understanding the task and the data
I started by reading the brief carefully and forming my own understanding of the problem before involving AI. I then used Claude to explain concepts, ask questions about the data, and analyse the CSV, JSON and letters. AI helped me get an overview quickly — the relationships between companies, the kinds of anomalies present in the data. But I always went back to the raw files and verified what AI claimed before trusting it.

# Phase 2 — Planning the architecture
I already had a clear idea: deterministic rules produce the facts; AI only explains and recommends on top. The most important architectural decision — that the numbers on the dashboard come from code, not from the model — was mine. The reason: for a legal governance tool, it is not acceptable for AI to miscount. Rules are reproducible; a language model is not.

AI helped me think through different approaches: how to process the CSV, JSON and PDF letters, which Python structures fit, and how the LLM interface should look. I wanted to use the Claude API since I was already working in Claude Code, and AI helped me evaluate alternatives. We made a concrete plan together — but the decisions were mine.

# Phase 3 — Building the backend
AI scaffolded the FastAPI app, Pydantic models and LLM client quickly, saving a lot of time on boilerplate. My focus was on getting the backend architecture right first, then making the frontend fit.

There were several moments where I had to step in:

# Python version. 
The first install failed because the machine was running Python 3.14. I made the decision to build on Python 3.11 for a concrete reason: reviewers need to run this on their own machines, and 3.14 is bleeding edge. I also dropped a compiled fuzzy-matching dependency in favour of stdlib difflib for the same reason.
# Env bug. 
After adding my API key to .env it wasn't being picked up. The cause was an empty ANTHROPIC_API_KEY already exported in the shell, taking priority over the file. I fixed it by configuring pydantic-settings to ignore empty environment variables.
# AI fabricated its own numbers. 
The LLM-written summary stated "two circular ownership loops." The deterministic detectors find exactly one (FGI-012 ↔ FGI-019). This confirmed my decision to keep fact production outside the model — the numbers the user sees come from code, not from Claude.

# Phase 4 — Frontend and iterative improvement
I worked iteratively on the frontend: tested the site, found something confusing, gave Claude a concrete suggestion for improvement. My principle throughout was: if I don't understand a feature myself, it isn't good enough. Along the way I also became more familiar with the data — company relationships, edge cases, ways to visualise the ownership structure.

One concrete example where I had to step in: fuzzy matching scored "Aurora Storage Holdings" against "Aurora Solar Holdings" at 88 — above any sensible threshold. AI would have accepted it. I recognised these as two different businesses and added a check that flags a high score when the distinguishing keyword differs. Flag, never auto-correct was a consistent principle throughout: for a governance tool, silently repairing data is the wrong default — it is a human's job to make that call.

# Phase 5 — AI Review as a second-opinion layer
After the deterministic rules were in place, I built a separate AI Review feature that lets Claude sweep the full register for concerns the rules might have missed — things that are hard to encode as explicit conditions, like unusual patterns or combinations of fields that together look suspicious.

I kept this deliberately separate from the main findings, and clearly labelled as lower-trust. The reason: the model's observations here are not precise enough to act on directly. It might flag something genuinely interesting, or it might hallucinate a concern that isn't there. For decisions as consequential as governance actions on legal entities, that distinction matters. The right use of this feature is as a prompt for a human to go and look — not as an additional source of verified facts.

# Phase 6 — Testing
I ran tests throughout the process — both the automated backend test suite (pytest, 31 tests covering detectors, ingestion, fuzzy matching, persistence and the API) and manual UI testing. Manual testing was particularly useful: going through the interface as a user revealed bugs and confusing behaviour that would have been hard to catch any other way. Some of these required fixes to both frontend and backend. Testing the UI also gave indirect coverage of the backend and database layer.

# Phase 7 — Repo structure, version control and git
I used AI to help structure the repository, organise documentation, write commit messages and push changes to GitHub. Every meaningful change was committed with a descriptive message explaining the why, not just the what. There were no merge conflicts throughout the project — the branching and commit flow stayed clean from start to finish.

# Summary
AI was indispensable for breadth and speed — boilerplate, data analysis, turning unstructured text into structure. It was not reliable for exact counts or for trusting data at face value. I also used ChatGPT as a second opinion when unsure about an approach — to see whether a different model landed on the same answer or raised objections.

The interesting engineering was drawing the line: let the rules produce the truth, let the model explain it — and keep the advisory AI sweep clearly separated from the verified findings.