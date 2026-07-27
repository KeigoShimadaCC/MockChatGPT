# Lore

The story of how MockChatGPT came together. The entire codebase was written in one day, **2026-07-27**, across 7 commits, by a single author. This is a short history, but there is a clear arc from research to scaffold to feature build-out.

## Eras

### Research first (2026-07-27, early commits)

The project opens with documentation, not code. Before writing the app, the author surveyed the competitive landscape and the tooling:

- `docs/01-chatbot-capabilities.md` — a capability matrix across ten major AI chat apps (ChatGPT, Claude, Gemini, Copilot, Grok, Perplexity, DeepSeek, Kimi, Qwen, Doubao).
- `docs/02-codex-sdk.md` — a deep dive on `@openai/codex-sdk`: what it brings natively (agentic loop, sandboxed shell, web search, vision, thread persistence) and what it does not (image/video generation, voice, native memory).
- `docs/03-mcp-options.md` — free/keyless MCP servers to fill capability gaps.
- `docs/04-codex-capability-mapping.md` — mapping the desired ChatGPT feature set onto what Codex can actually deliver.

This research framed the whole design: use Codex for the core loop, and reproduce the ChatGPT features it lacks with files and prompts.

### The scaffold (commit `5b1e2cb`)

The first code commit, "MockChatGPT: ChatGPT-style chat app on the OpenAI Codex SDK", landed the whole foundation at once: 15 files, ~2,886 lines. It established the three-layer architecture (browser SPA, Express server, Codex agent), the SSE chat pipeline, JSON persistence, the workspace persona in `workspace/AGENTS.md`, memory, custom instructions, and conversation history. Everything after this is refinement and feature addition.

### Polish and fixes (commits `b69dda4`, `9cc44c2`)

Immediately after the scaffold came a documentation addition (the ten-app capability matrix) and a small UI fix for short user-message bubbles collapsing, bundled with a docs update noting Sora's shutdown. The bubble fix is preserved as a convention: keep `max-width` on `.msg-box`, not `.bubble`.

### The interactive engine (commit `e0a3649`)

"model/effort picker + live agentic thinking timeline" (+293 / -72) added two defining pieces of the UX: the top-bar model and reasoning-effort dropdown, and the live "thinking" timeline that streams every agent action (reasoning, commands, searches, file edits) into an expandable, replayable per-message panel. This is where the app started to feel agentic rather than just a chat box.

### Richer input (commit `44f5ae5`)

"drag-drop/paste uploads, sandbox network, document-format handling" (+48 / -6) made file input first-class: drag-and-drop and paste uploads, network access enabled in the Codex sandbox (needed so the agent can pip-install PDF parsers), and workspace-persona guidance for reading Office/PDF formats.

### Developer guidance (commit `b977ad4`)

"docs: add repo-root AGENTS.md and CLAUDE.md" (+66) split guidance into two clearly separated audiences: the repo-root `AGENTS.md`/`CLAUDE.md` for developers, and `workspace/AGENTS.md` for the runtime agent persona. The distinction is now a documented gotcha.

### The feature bundle (commit `b2a196c`)

The final and second-largest commit, "scheduled tasks, projects, deep research modes, MCP connector manager" (11 files, +1,124 / -14), added four sizeable capabilities in one go:

- `server/scheduler.js` — the scheduled-task engine.
- Projects — grouped chats with per-project instructions and files.
- Deep-research modes — the Wide/Deep prompt protocols in `server/prompts.js`, informed by `docs/05-deep-research-modes.md` (a survey of how the industry builds deep research).
- `server/mcp.js` — the MCP connector catalog and install/remove manager.

This commit roughly doubled the server's module count and brought the app close to feature parity with the daily-driver ChatGPT loop.

## Longest-standing features

Because the whole project is one day old, "longest-standing" means "present since the scaffold" (`5b1e2cb`): the SSE chat pipeline (`server/index.js`, `server/codexClient.js`), JSON persistence (`server/store.js`), the first-turn preamble (`server/prompts.js`), the workspace persona (`workspace/AGENTS.md`), and the vanilla-JS frontend shell. Every later commit built on these without rewriting them.

## Deprecated features

None yet. The `docs/04-codex-capability-mapping.md` table originally marked deep research, scheduled tasks, and projects as "future" (➖); commit `b2a196c` shipped all three, so those doc rows now trail the implementation.

## Growth trajectory

From ~2,900 lines at the scaffold to ~3,200 tracked source lines after the feature bundle. The growth is almost entirely additive: new server modules (`scheduler.js`, `mcp.js`), new routes in `index.js`, and new UI in `app.js`/`app.css`/`index.html`. No module has been removed.

For the quantitative side of this history, see [By the numbers](by-the-numbers.md). For lighter trivia, see [Fun facts](fun-facts.md).
