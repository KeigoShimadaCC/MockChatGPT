# MockChatGPT 🌀

A ChatGPT-lookalike chat app powered by the **[OpenAI Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript)** — it runs on your **ChatGPT subscription** (via `codex login`), no API key or per-token billing.

The goal: a chat app a ChatGPT user feels immediately at home in, backed by a genuinely agentic engine.

## What it can do

| Capability | How |
|---|---|
| 💬 Chat with streaming + markdown/code rendering | Codex agent, SSE streaming |
| 🔎 Web search with cited sources | Codex built-in web search |
| 🧮 Code interpreter / data analysis | Codex executes code in a sandboxed workspace |
| 🖼️ Image understanding (vision) | Upload images → Codex `local_image` input |
| 🎨 Image generation | Codex's built-in `image_gen` tool when available; otherwise programmatic SVG / matplotlib / PIL into `workspace/generated/` |
| 📎 File uploads (PDF, CSV, …) | Files land in the agent workspace; the agent reads them |
| 🧠 Persistent memory across chats | `workspace/memory.md`, auto-updated by the agent, editable in Settings; "memory dreaming" dedupes/prunes it on demand or weekly |
| ⚙️ Custom instructions & nickname | Settings modal, injected per conversation |
| 🗂️ Conversation history | Sidebar with search, rename, delete, date grouping |
| 🎛️ Model & reasoning picker | Top-bar dropdown: GPT-5.6 tiers or custom model id, effort minimal→xhigh |
| 🔬 Deep research modes | Composer picker: **Wide** (broad multi-angle sweep, 15+ sources), **Deep** (iterative rounds with a notes scratchpad), or **Heavy** (orchestrator plans → 3–4 sub-researchers run in parallel on their own threads → one synthesized cited report); see docs/05 |
| ⏰ Scheduled tasks | Daily/weekly/interval/once schedules; each run is a real agent turn logged to a "⏰" conversation |
| 📁 Projects | Group chats with per-project instructions and files |
| 🧩 Connectors (MCP) | Catalog + custom install/uninstall backed by `codex mcp`; or just ask in chat — the agent proposes, you approve |
| 🧩 Live "Thinking" timeline | Every agentic action (reasoning, commands + output, searches, file edits) streams into an expandable per-message panel, saved and replayable |
| 🌐 Live browser view | When the agent browses (Playwright MCP), the timeline shows "Browsing: …" rows with inline screenshots |
| ⏹️ Real stop / regenerate / edit | Stop actually kills the Codex turn server-side; regenerate and edit-and-resend rewrite the stored transcript |
| 🔔 Desktop notifications | Fired when a turn finishes in a hidden tab or a scheduled task lands; click to open the chat |
| 📚 Self-authored skills | The agent writes its own reusable playbooks in `workspace/skills/` and consults them; view/edit them from the sidebar |
| 📊 Activity & usage dashboard | "What did my agent do?" audit feed across all chats + token usage heat-bar chart; per-message token counts in the Thinking header |
| ⌨️ Slash macros & profiles | User-defined `/commands` with `{{var}}` fill-in forms; switchable instruction profiles (Work/Personal/…) |
| ⏱️ Turn time budget | Optional hard cap: stop any turn after N minutes (Settings) |

## Quick start

```bash
npm install -g @openai/codex   # if you don't have the Codex CLI
codex login                    # sign in with your ChatGPT account

npm install
npm start                      # → http://localhost:3939
```

## Architecture

```
Browser (vanilla JS, ChatGPT-style UI)
  │  SSE
Express server (server/index.js)
  │  @openai/codex-sdk (threads, streaming events)
Codex CLI  ──ChatGPT subscription auth──▶  OpenAI
  │
workspace/   ← agent sandbox: AGENTS.md, uploads/, generated/, memory.md
data/        ← conversations + settings (JSON)
```

- Each conversation maps to a persistent **Codex thread** (`resumeThread`), so context survives server restarts.
- `workspace/AGENTS.md` gives the agent its standing "you are MockChatGPT" instructions.
- Codex runs with `sandboxMode: workspace-write` — it can only write inside `workspace/`.

## Research docs

1. [Chatbot capability matrix (ChatGPT, Claude, Gemini, Copilot, Grok, Perplexity, DeepSeek, Kimi, Qwen, Doubao)](docs/01-chatbot-capabilities.md)
2. [Codex SDK deep dive](docs/02-codex-sdk.md)
3. [Free MCP servers to fill capability gaps](docs/03-mcp-options.md)
4. [Which capabilities Codex SDK covers](docs/04-codex-capability-mapping.md)
5. [How the industry builds deep research (and our mode design)](docs/05-deep-research-modes.md)
6. [Roadmap: 10 researched features ChatGPT/Claude lack](docs/06-roadmap-proposals.md)

## Known gaps vs. real ChatGPT

- Diffusion-grade image generation only when Codex's built-in `image_gen` tool fires (programmatic SVG/chart fallback otherwise; the Connectors catalog offers HF Spaces/FLUX as an alternative)
- No voice mode, no video generation
- No canvas, no multi-user sharing
- Single user, local only — do not expose the port publicly (the agent can execute code)
