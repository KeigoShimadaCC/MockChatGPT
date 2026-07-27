# How the industry builds "deep research" — and how MockChatGPT does it

Research compiled 2026-07-27 from official engineering posts, help docs, academic papers, and open-source implementations (four parallel research passes; sources at the end).

## Vendor pipelines at a glance

| Product | Shape | Distinctive traits |
|---|---|---|
| **ChatGPT Deep Research** | Clarify → visible research plan → RL-trained browse loop → cited report | o3-based model trained end-to-end with RL on browsing; folded into Agent Mode (visual browser); API caps effort via `max_tool_calls`; runs "tens of minutes" |
| **Claude Research** | Orchestrator–workers | Lead agent (Opus) plans and spawns parallel subagents (Sonnet) with bounded scopes; iterative deepening; separate **CitationAgent** attributes sources post-hoc; ~15× chat token cost; 90% wall-clock cut from parallelism |
| **Gemini Deep Research** | **Editable plan** → iterative search-read-search loop → Canvas report | Plan shown to user with an "Edit plan" control before execution; 1M-token context for synthesis; 5–10+ min; exports to Docs/Audio Overview |
| **Perplexity** | Ladder of modes | Pro Search (quick) → Deep Research (2–4 min, dozens of searches) → Labs (multi-asset outputs) → "Computer" (up to 20 models, "Search as Code": model writes code that fans out thousands of retrieval steps) |
| **Grok** | DeepSearch vs **DeeperSearch** | Two user-selectable intensities of the same pipeline — the closest precedent for MockChatGPT's mode picker; a dedicated `grok-4.20-multi-agent` model variant exists |
| **Kimi Researcher** | End-to-end RL single agent | ~23 reasoning steps, 200+ URLs per task; context management discards stale documents to run 50+ iterations |
| **Tongyi/Qwen DeepResearch** | ReAct vs **Heavy Mode** (IterResearch) | Round-based: each round rebuilds a clean workspace from only the essential findings of the last round; Heavy Mode adds parallel angle-agents + a synthesis agent |
| **LangChain Open Deep Research** (OSS) | Scope → Research (supervisor + parallel subagents) → Write | Subagents compress findings before returning (context isolation); final report written in ONE shot — parallel section-writing produced disjoint reports |
| **Stanford STORM/Co-STORM** (academic) | Perspective-based question asking → outline → draft | Multiple personas interview a retrieval-grounded expert; +25% organization, +10% breadth vs RAG baselines |

## The taxonomy

Two fundamental strategies emerge everywhere:

1. **Breadth-first ("wide")** — decompose the topic into independent angles, sweep them in parallel (subagents or batched searches), synthesize once at the end. Wins on coverage and speed; risks shallow reads. (Claude subagents, LangChain ODR, Tongyi Heavy Mode's parallel angles, Perplexity Computer.)
2. **Depth-first ("deep")** — a single iterative loop: search → actually read → note findings and *new questions* → chase the trail. Wins on hard, entangled questions; costs time. (Kimi Researcher, Gemini's loop, Tongyi IterResearch, Doubao's "think-while-searching".)

Recurring quality techniques regardless of strategy:
- **Plan first, show the plan** (ChatGPT, Gemini — Gemini's is editable)
- **Scratchpad/notes files** instead of ballooning context (IterResearch's workspace reconstruction; LangChain's compression)
- **Citation discipline** as a separate concern (Claude's CitationAgent; benchmark suites weight citation accuracy heavily)
- **Single-writer synthesis** — never write the report in parallel pieces
- **Effort as a user-facing dial** (Grok DeepSearch/DeeperSearch; OpenAI `max_tool_calls`) — validating a mode picker rather than one monolithic "research" button

## Design implications for MockChatGPT (as implemented)

MockChatGPT ships a composer-level mode picker (the Grok-style dial) with per-turn prompt protocols on top of the Codex agent:

- **Research: Wide** — breadth-first: plan 6–10 angles silently, ≥8 distinct queries, 15+ sources, structured report with a conflicting-information section and inline citation on every claim. (First live run: 10 searches, 48 citations, 15.5k-char report.)
- **Research: Deep** — depth-first: plan written to `research_notes.md` (the scratchpad pattern), ≥3 search→read→gap-analysis rounds where later rounds chase specifics surfaced earlier, report with an explicit "what remains uncertain" section.

- **Research: Heavy** — the orchestrator–worker shape (Claude Research's), implemented in `server/heavyResearch.js`. Three phases inside one SSE stream:
  1. **Plan** — a turn on the conversation's own thread (so the plan stays in context for phase 3) decomposes the question into 3–4 independent, self-contained sub-questions, emitted as a fenced ` ```subquestions ` JSON array. Its prose is kept out of the message body; only the parsed list surfaces, as a timeline row.
  2. **Workers** — one throwaway Codex thread per sub-question (`startThread()`, same workspace), all awaited under a single `Promise.all`. Each is bounded by prompt: ≤6 web searches, no shared-file writes except `notes/sub-<i>.md`, final message *is* the deliverable. Their events are forwarded into the same stream with ids namespaced `sub<i>-…` and labels prefixed "Sub-researcher <i>", so the timeline renders parallel lanes instead of collapsing two workers' identical searches into one row.
  3. **Synthesis** — the collected summaries go back to the conversation thread, which writes one cited report in a single narrative voice and is told to resolve disagreements explicitly.

  Guardrails: max 4 workers; a 10-minute wall-clock deadline per phase (`Promise.race` against a timer); isolated worker failure — one that throws or times out becomes an error row while synthesis proceeds with the survivors, its sub-question named to the synthesizer as a coverage gap. If the `subquestions` block can't be parsed the run degrades to the single-agent wide protocol rather than failing.

Both modes are **plan-first**, the Gemini pattern: the first turn only restates the question and emits its plan as a fenced `research-plan` JSON block, which the UI renders as a card of editable items. "Start research" sends a follow-up turn in mode `wide-exec`/`deep-exec` carrying the approved items, and the execution protocol above runs prefixed with "The user approved this plan — follow it". A "Skip plan approval" checkbox in the mode menu (persisted in localStorage) restores the original one-shot behaviour.

Deliberate simplifications vs. the big players: no post-hoc citation agent (inline citation discipline is prompted instead). Heavy mode closes the "no parallel subagents" gap — the Codex SDK runs one agent per thread, so parallelism comes from spawning several threads and multiplexing their event streams.

## Sources

Anthropic engineering: multi-agent research system (anthropic.com/engineering/multi-agent-research-system); claude.com/blog/research. OpenAI: introducing-deep-research, Deep Research FAQ (help.openai.com/10500283), developers.openai.com deep-research API guide. Google: support.google.com/gemini/answer/15719111, blog.google Gemini Deep Research launch. Perplexity: research.perplexity.ai (WANDR benchmark), press coverage of Perplexity Computer. xAI: docs.x.ai/docs/models, Grok Wikipedia. Moonshot: moonshotai.github.io/Kimi-Researcher. Alibaba: tongyi-agent.github.io, github.com/Alibaba-NLP/DeepResearch. OSS/academic: github.com/langchain-ai/open_deep_research, huggingface.co/blog/open-deep-research, STORM (arXiv:2402.14207), Co-STORM (arXiv:2408.15232), surveys arXiv:2506.18096 & 2506.12594, GAIA/BrowseComp/DeepResearch-Bench benchmark papers. Some vendor pages blocked fetching; details triangulated from multiple secondary sources — low-confidence items flagged in the sub-reports.
