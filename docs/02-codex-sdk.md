# Codex SDK research

The [OpenAI Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript) (`@openai/codex-sdk`) embeds the same agent that powers the Codex CLI into a TypeScript/JavaScript program. It drives the locally installed `codex` binary, so it authenticates with **your ChatGPT subscription** (`codex login`) — no separate API key or per-token billing.

## Core API

```ts
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: "/path/to/workspace",
  skipGitRepoCheck: true,
  sandboxMode: "workspace-write",
  webSearchEnabled: true,
});

// blocking
const turn = await thread.run("Do something");

// streaming
const { events } = await thread.runStreamed("Do something");
for await (const event of events) { /* ... */ }

// persistence — threads survive process restarts
const again = codex.resumeThread(savedThreadId, options);
```

### Thread options

| Option | Purpose |
|---|---|
| `model` | override model (default: codex default, GPT-5.x codex) |
| `sandboxMode` | `read-only` \| `workspace-write` \| `danger-full-access` |
| `workingDirectory` | agent's workspace |
| `skipGitRepoCheck` | allow running outside a git repo |
| `webSearchEnabled` / `webSearchMode` | enable the built-in web search tool |
| `networkAccessEnabled` | allow network from inside the sandbox |
| `modelReasoningEffort` | minimal/low/medium/high |
| `approvalPolicy` | when to ask for approval (SDK apps usually run unattended) |

### Streaming events

Top-level: `thread.started`, `turn.started`, `turn.completed` (with token usage), `turn.failed`, `item.started` / `item.updated` / `item.completed`, `error`.

Item types inside `item.*` events: `agent_message`, `reasoning`, `command_execution` (command, aggregated_output, exit_code), `file_change`, `mcp_tool_call`, `web_search` (query), `todo_list`, `error`.

### Multimodal input

`thread.run()` / `runStreamed()` accept structured input, including local images:

```ts
await thread.run([
  { type: "text", text: "Describe this screenshot" },
  { type: "local_image", path: "./ui.png" },
]);
```

## What Codex brings natively

- Agentic loop with reasoning (o-series style "thinking")
- Shell/command execution in an OS-level sandbox (Seatbelt on macOS, Landlock on Linux)
- File reading/writing/patching in the workspace
- Web search
- Local image viewing (vision)
- MCP client support (configured via `~/.codex/config.toml`) — extend with any MCP server
- Session/thread persistence (resume by thread id)
- `AGENTS.md` — standing instructions automatically loaded from the workspace

## What it does NOT bring (relevant to a ChatGPT clone)

- No image/video generation model (workaround: generate SVG / matplotlib / PIL programmatically, or add an MCP server)
- No voice I/O
- No built-in cross-conversation memory (workaround: memory file in the workspace + AGENTS.md convention)
- No hosted browser/computer-use surface (workaround: Playwright MCP)
- No document/canvas collaborative editing
