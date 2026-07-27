# MockChatGPT

MockChatGPT is a ChatGPT-lookalike chat app that runs on your ChatGPT subscription instead of a metered API key. It wraps the [OpenAI Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) (`@openai/codex-sdk`) behind a familiar chat UI, so a single user gets streaming chat, web search, code execution, file uploads, image understanding, persistent memory, projects, scheduled tasks, and MCP connectors, all billed to their ChatGPT account via `codex login`.

## What it is

The project answers a specific question: how close can you get to the ChatGPT product experience using only the Codex agent as the engine? Codex already provides the hard parts (an agentic reasoning loop, a sandboxed shell, web search, vision, and thread persistence). MockChatGPT adds a ChatGPT-style frontend, a thin Express server that maps Codex streaming events to server-sent events (SSE), and the product features Codex does not ship natively (memory, custom instructions, projects, scheduled tasks, a connector manager, and deep-research prompt protocols).

It is deliberately single-user and localhost-only. The embedded agent can execute code on your machine, so the port must never be exposed publicly.

## Who uses it

One person, on their own machine. There is no auth, no multi-tenant model, and no cloud deployment. Conversations, settings, projects, and tasks are stored as JSON files under `data/`; the agent's sandbox lives under `workspace/`.

## What it can do

| Capability | How it works |
|---|---|
| Streaming chat with markdown/code rendering | Codex agent over SSE (see [Chat and streaming](../features/chat-and-streaming.md)) |
| Web search with cited sources | Codex built-in web search tool |
| Code interpreter / data analysis | Codex executes code in the `workspace/` sandbox |
| Image understanding (vision) | Uploaded images passed as Codex `local_image` input |
| Image generation | Agent renders SVG / matplotlib / PIL into `workspace/generated/` and embeds it |
| File uploads (PDF, CSV, Office, …) | Files land in the sandbox; the agent reads them (see [File and image handling](../features/file-and-image-handling.md)) |
| Persistent memory across chats | `workspace/memory.md`, auto-updated by the agent (see [Memory and personalization](../features/memory-and-personalization.md)) |
| Custom instructions, nickname, model/effort picker | Settings + top-bar dropdown, injected per conversation |
| Deep research modes | Composer picker: Wide or Deep (see [Deep research](../features/deep-research.md)) |
| Scheduled tasks | Daily/weekly/interval/once runs, each a real agent turn (see [Scheduled tasks](../features/scheduled-tasks.md)) |
| Projects | Grouped chats with per-project instructions and files (see [Projects](../features/projects.md)) |
| MCP connectors | Catalog + custom install backed by `codex mcp` (see [Connectors](../features/connectors.md)) |
| Live "thinking" timeline | Every agent action streams into a replayable per-message panel |

## Quick links

- [Architecture](architecture.md) — how the browser, server, and Codex fit together
- [Getting started](getting-started.md) — prerequisites, install, run
- [Glossary](glossary.md) — project-specific vocabulary
- [Systems](../systems/index.md) — the backend building blocks
- [Features](../features/index.md) — user-facing capabilities, end to end
- [API reference](../api/index.md) — the HTTP + SSE surface
- [Security](../security.md) — trust boundaries and why localhost-only matters

## Tech stack at a glance

- **Backend:** Node.js (>=20), Express 4, ES modules. No build step, no bundler.
- **Agent engine:** `@openai/codex-sdk`, driving the locally installed `codex` binary.
- **Frontend:** Vanilla JS single-page app. Vendored `marked`, `dompurify`, and `highlight.js` served straight out of `node_modules`. No framework.
- **Persistence:** JSON files on disk (`data/` for chats/settings/tasks, `workspace/` for the agent sandbox).
