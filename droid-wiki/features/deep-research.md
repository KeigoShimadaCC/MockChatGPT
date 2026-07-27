# Deep research

Deep research is a per-message mode switch in the composer that prepends explicit research instructions to the user prompt. `server/prompts.js` defines two protocols: `wide` for breadth-first coverage and `deep` for iterative depth-first investigation.

## Purpose

Give users a deliberate control over research strategy without changing the rest of the chat flow.

## How it works

```mermaid
flowchart LR
  UI[Mode picker<br/>`currentMode` in `public/app.js`] --> Req[`researchMode` in message POST]
  Req --> Prompt[`researchProtocol(researchMode)` in `server/prompts.js`]
  Prompt --> Agent[Codex turn runs with injected `<research_mode>` block]
  Agent --> Out[Structured cited answer in normal chat stream]
```

### Wide protocol (`mode === "wide"`)

`researchProtocol("wide")` injects a `<research_mode name="Deep research — Wide">` block that requires:

1. Plan silently across **6–10 distinct angles/sub-questions**.
2. Run at least **8 genuinely different web queries** (one sweep per angle).
3. Gather **15+ distinct sources**.
4. Output a structured markdown report with:
   - TL;DR
   - one section per angle
   - comparison table where useful
   - explicit **"Conflicting information"** note
   - inline citation links for every factual claim
   - numbered Sources list

### Deep protocol (`mode === "deep"`)

`researchProtocol("deep")` injects `<research_mode name="Deep research — Deep">` requiring:

1. Write a plan to `research_notes.md` (overwrite): core question, hypotheses, 3–5 sub-questions.
2. Run at least **3 iterative rounds** of:
   - search the web for the most important open question,
   - read the best 1–3 sources,
   - append findings and new questions to `research_notes.md`,
   - reassess unknowns/contradictions and follow specifics from prior rounds.
3. Output a reasoned report with TL;DR, argument/implications, inline citations, explicit **"What remains uncertain"**, and Sources.

Design context for this wide-vs-deep split is documented in [`docs/05-deep-research-modes.md`](../../docs/05-deep-research-modes.md).

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Mode dropdown state (`currentMode`), label updates, and inclusion of `researchMode` in send payload |
| `server/index.js` | Adds `researchProtocol(researchMode)` into each turn input |
| `server/prompts.js` | Authoritative Wide/Deep prompt blocks and requirements |
| `docs/05-deep-research-modes.md` | Design rationale and external pattern survey behind the mode taxonomy |

## Integration points

- Works inside the same chat stream path documented in [SSE chat pipeline](../systems/sse-chat-pipeline.md).
- Runs on the same Codex thread settings described in [Codex integration](../systems/codex-integration.md).
- Uses the same `/api/conversations/:id/messages` endpoint documented in [REST endpoints](../api/rest-endpoints.md).
- Complements [Chat and streaming](chat-and-streaming.md) by changing prompt strategy, not transport/UI rendering semantics.

## Entry points for modification

- Adjust mode names/options and button text in `public/app.js` (`#mode-btn`, `#mode-menu`, `updateModeUI`).
- Change research requirements in `researchProtocol()` within `server/prompts.js`.
- If adding a new mode, extend both frontend mode selection and backend protocol mapping.
