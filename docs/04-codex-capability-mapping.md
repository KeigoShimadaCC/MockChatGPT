# Which chat-app capabilities can the Codex SDK actually deliver?

Mapping the capability list from [01-chatbot-capabilities.md](01-chatbot-capabilities.md) onto what `@openai/codex-sdk` (running on a ChatGPT subscription) can do, and how MockChatGPT uses it.

| Capability | Codex SDK? | How / workaround | In MockChatGPT |
|---|---|---|---|
| Chat with streaming | ✅ native | `runStreamed()` events | ✅ |
| Web search + citations | ✅ native | `webSearchEnabled: true`, `web_search` items | ✅ |
| Code interpreter / run code | ✅ native | sandboxed shell in workspace (`workspace-write`) | ✅ |
| Vision / image understanding | ✅ native | `{ type: "local_image", path }` input | ✅ (upload → attach) |
| File upload & document Q&A | ✅ native | files in workspace, agent reads via shell | ✅ |
| Data analysis + charts | ✅ native | executes Python/matplotlib, saves chart files | ✅ (rendered from `generated/`) |
| Image generation | 🟡 partial | built-in `image_gen` skill/tool when available; otherwise programmatic SVG/PIL | ✅ (both paths, via AGENTS.md) |
| Persistent memory | 🟡 DIY | no native memory; `memory.md` + AGENTS.md convention + preamble injection | ✅ |
| Custom instructions | 🟡 DIY | prepend to first turn / AGENTS.md | ✅ |
| Conversation persistence | ✅ native | `resumeThread(threadId)` survives restarts | ✅ |
| Multi-step autonomous agent | ✅ native | it's the same agent as Codex CLI (plan/execute loops) | ✅ inherently |
| Coding agent | ✅ native | that's literally Codex | ✅ |
| MCP connectors | ✅ native | `~/.codex/config.toml` `mcp_servers` | ➖ configurable, none bundled |
| Computer use / browser agent | 🟡 via MCP | Playwright MCP (see doc 03) | ➖ future |
| Deep research mode | 🟡 approximable | web search + multi-step loop; no dedicated mode | ➖ (normal search works) |
| Canvas / artifacts | ❌ | would need custom UI surface | ❌ |
| Voice mode | ❌ | no audio I/O in SDK | ❌ |
| Video generation (Sora) | ❌ | nothing comparable; no free MCP of note | ❌ |
| Scheduled tasks | 🟡 DIY | cron + `codex exec` / SDK script | ➖ future |
| Projects/workspaces | 🟡 DIY | per-project workspace dirs + AGENTS.md | ➖ future |

## Verdict

Codex SDK covers the **core daily-driver ChatGPT loop** surprisingly well: chat, search, code execution, vision, files, data analysis, and (via its built-in `image_gen` tool) even raster image generation — all billed to a ChatGPT subscription with no API key.

The real gaps are **voice, video (Sora), and canvas** — modality features that need dedicated models/UI, not agent tooling. Memory and custom instructions are absent natively but trivially reproducible with files (that's how MockChatGPT does it). See [03-mcp-options.md](03-mcp-options.md) for free MCP servers that close several remaining gaps (browser automation, image gen alternatives, connectors).
