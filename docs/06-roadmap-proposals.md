# Ten features ChatGPT & Claude don't have — proposals for MockChatGPT

Researched 2026-07-28 in three passes: power-user complaints/wishlists (primarily the Hacker News corpus via Algolia; Reddit was fetch-blocked), a survey of ~15 indie/OSS chat frontends (TypingMind, Msty, Jan, Chatbox, Raycast, LibreChat, Open WebUI, LobeChat/LobeHub, big-AGI, Cherry Studio, AnythingLLM, BoltAI, Witsy…), and a sweep of experimental products + 2024–26 HCI research (canvas chat, Loom, arena interfaces, ambient agents). Cross-checked against ChatGPT/Claude's 2025–26 releases (Tasks/Pulse/Agent Mode/branch-to-new-chat; Routines/Cowork/artifacts/skills/memory in both).

Meta-finding from the wishlist pass: *where the vendors moved, they moved on the easy axis* — both shipped time-based scheduling and proactive output, neither has touched **rollback, event triggers (chat surface), audit trails, budgets, or non-linear conversation**. Those are simultaneously the most-requested agentic capabilities and the least served — and most of them are easier for a *local* code-executing agent than for a cloud product.

A verification pass against both vendors' official release notes (through Jul 24, 2026) confirmed every proposal below targets a genuine gap, with two wording corrections applied: ChatGPT's desktop app **does** access local files since Jul 9, 2026 (the gap is event-*triggered* automation, not file access), and Claude **does** have API/GitHub-event triggers — but only in Claude Code routines, not the chat app.

Ranked by (demand evidence × uniqueness × feasibility on our Codex stack):

## 1. Workspace Time Machine — undo for agent actions 🥇feasibility
Per-turn git checkpoints of the workspace with a **Revert** button on every assistant message. The single most concrete agentic ask on HN ("automatic checkpoints … so much faster to roll back than to get the LLM to fix a mistake"); neither consumer product has any undo for side effects. We own the workspace: `git init` + auto-commit after each turn, revert = `git checkout`. Cloud products can't credibly do this for *your* machine.

## 2. Event-driven automations — triggers, not just cron
"When a CSV lands in ~/Downloads → clean it and append to my report"; "when this webhook fires → run this prompt". ChatGPT's docs are explicit that Tasks "don't currently support webhooks" (time-based only, min 1-hour interval); Claude's chat-app scheduled tasks are schedule-only too — the one exception is **Claude Code routines** (Apr 2026), which added API and GitHub-event triggers, but on the developer surface, not the chat app, and with per-day run caps. Nobody has **filesystem watchers** — and note ChatGPT's desktop app *can* access local files on demand since Jul 2026, so the precise gap is *event-triggered* local automation, not file access itself. A local agent can watch the filesystem (fs.watch), expose a localhost webhook endpoint, and poll RSS/IMAP — extending our existing scheduler from "when it's 8am" to "when something happens".

## 3. Branch Explorer — a visible conversation tree with branch diffing
The loudest overall complaint category. ChatGPT's "Branch in new chat" (Sept 2025) is a flat fork with no hierarchy; Claude has nothing; a cottage industry of tree-UI tools exists (Nodea, Bonsai, ChatTree, Flowith…). Best product prior art: **Msty Branch Explorer** (branch labels, minimap, side-by-side diff of two branches). The research backs it: **CanvasConvo** (arXiv 2605.15848, 24-participant multi-day field study) found the key is *seamless switching between linear and non-linear modes* — don't pay the canvas tax when you don't need it — and CHI 2026's **Branchat** adds transparent context scoping (show which messages are in the window). Ours: fork any message into a child thread (new Codex thread seeded with a transcript summary — threads can't natively fork), store the tree in the conversation JSON, render a tree map with two-branch diff.

## 4. Beam — blind parallel attempts with merge strategies
Send one prompt to N parallel agents "blind" (different models/efforts/temperaments), show side-by-side, then **Fuse / Compare / Pick** merge passes — big-AGI's flagship, marketed as "multi-model de-hallucination"; Msty Split Chat and TypingMind Multi-Model+Finalize are cousins, and Arena's Battle Mode proves the extra twist worth stealing: keep the variants **anonymous until you vote**, which removes your own brand/effort bias. Neither big vendor lets you fan out and compare. We already built the hard part (heavy mode's parallel thread orchestration + multiplexed streams); Beam is the same machinery pointed at *any* prompt, plus a compare UI. Single-vendor caveat: our "models" are GPT-5.6 tiers/efforts (+ local models via #10), not cross-vendor.

## 5. Claim Audit — per-claim verification overlay
A "Verify this answer" button: a verification agent re-searches each factual claim and annotates it ✅ sourced / ⚠️ unverifiable / ❌ contradicted, with links. Deep-research trust is a top complaint ("it will take as long to verify as to research!"); a Show HN shipped exactly this (per-claim "Cleared / Needs attention") and it resonated. We have web search + a Thinking timeline to show the audit work; render as an annotation layer over the message.

## 6. Agent Audit Inbox — "what did my agent do today?"
A digest view aggregating everything the agent did across all surfaces: scheduled-task runs, files created/modified, memory writes, skills learned, connectors used — with drill-down to each Thinking timeline. The #1 trust complaint for agents is zero observability; ChatGPT Pulse is proactive *content*, not an audit trail. We already persist every activity — this is mostly a view + an optional morning-brief task that summarizes it.

## 7. Budgets & live usage meter
Per-turn token counts (we already receive `usage` events and drop them!), a usage dashboard (per day/model/feature, Msty-Insights-style heat map), and **hard per-task budgets** — "stop this turn after N tokens/minutes" wired into our real server-side stop. Both vendors are notoriously opaque ("you might use your 5hr limit in 7-10 minutes"); neither offers pre-run caps.

## 8. Shadow Critic — a second model watching the chat
Msty's Shadow Personas, found nowhere else: an observer model that doesn't participate but reviews each answer (facts, logic, missed requirements) and posts a compact note beneath it — optionally auto, optionally on demand. Cheap to run at minimal effort on a parallel thread; pairs with #5 as lightweight continuous verification vs. deep on-demand audit.

## 9. Slash macros & instruction profiles
User-defined `/commands` with typed variables (Open WebUI's `{{var | select:...}}` form-popup is best-in-class; Raycast's `{selection}`/`{argument}` pattern), plus multiple switchable instruction sets (work/personal/writing personas). Power users literally version their custom instructions in git as a workaround; ChatGPT allows one instruction set, Claude one per project. Low effort: composer autocomplete + settings CRUD; complements the agent-authored skills system (machine-learned vs user-defined playbooks).

## 10. Private Mode — local model fallback via `codex --oss`
A "Local (private)" entry in the model picker that runs turns through Codex's `--oss` path (Ollama/local models): no tokens leave the machine, badge on the conversation, works offline. "Local AI needs to be the norm" is a persistent wishlist theme; OpenAI/Anthropic structurally can't ship this. Caveats: needs Ollama + a decent local model; agentic quality drops; verify the SDK exposes the oss/provider config (CLI has `--oss`).

## Cut, and why
Context pin/evict control (compaction happens inside Codex — limited leverage), cross-chat @-linking (memory partially covers), folders/tags/timestamps (worthy but mundane), Figma-style multiplayer (out of scope for a single-user local app), Elo arena (subsumed by Beam), TypingMind-style live HTTP context injection (MCP covers it), per-word confidence coloring à la variantgpt/TokenProbe (needs logprobs, which the Codex SDK doesn't expose), canvas-as-runtime à la tldraw computer and Loom-style multiverse navigation (fascinating, but a different product), ambient "overhearing" agents (arXiv 2509.16325 — the always-on capture raises privacy stakes we shouldn't take on casually; the file-watch triggers in #2 are the consent-safe slice of it).

## Suggested build order
Quick wins first: **7 → 6 → 9** (data/UI over existing plumbing) · then the trust pair **1 + 5** · then the headliners **3 → 4 → 2** · **8** rides on 4's infra · **10** last (external dependency).

Sources: HN threads via Algolia (ids 45430505, 46237398, 47768133, 46978710, 48000679, 42916376, 45108091, 44116872, 43572491 et al.); vendor docs: docs.msty.ai (Branch Explorer, Shadow Personas, Split Chat, Turnstiles, Insights), big-agi.com (Beam/merge modes), docs.typingmind.com (Multi-Model, Dynamic Context), Open WebUI docs (Automations, typed prompt variables, analytics, Channels), LibreChat docs (fork modes, skills sync), lobehub changelog (Agent Groups, CAO, Task Scheduler), Raycast manual (AI Commands, skills interop), plus ChatGPT/Claude release coverage as of July 2026.
