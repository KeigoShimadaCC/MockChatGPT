# Glossary

Project-specific terms and domain vocabulary used throughout MockChatGPT and this wiki.

**Activity** — A single agent action captured from the Codex stream (reasoning, command execution, web search, file change, MCP tool call, plan/todo, or error). Activities are forwarded to the browser as `activity` SSE events and stored on the assistant message so the "thinking" timeline can be replayed. Defined in `server/codexClient.js`.

**AGENTS.md (workspace)** — `workspace/AGENTS.md` is the agent's standing persona: "you are MockChatGPT…". Codex loads it automatically from the working directory. It is product content, distinct from the repo-root `AGENTS.md`, which is developer guidance.

**Codex SDK** — `@openai/codex-sdk`, the npm package that embeds the Codex agent into a Node program by driving the local `codex` binary. See [Codex integration](../systems/codex-integration.md).

**Connector** — A user-facing name for an MCP server registered with the local Codex install (`codex mcp`). Managed through the Connectors modal or proposed by the agent in chat. See [Connectors](../features/connectors.md).

**Effort / reasoning effort** — The Codex `modelReasoningEffort` option (minimal, low, medium, high, xhigh). Selectable from the top-bar model picker and stored in settings.

**Item** — A unit inside a Codex `item.*` event. Item types include `agent_message`, `reasoning`, `command_execution`, `file_change`, `web_search`, `mcp_tool_call`, `todo_list`, and `error`.

**mcp-install card** — A fenced code block with language `mcp-install` containing JSON. The agent emits it to propose a connector; the frontend renders it as an "Approve & install" card. The agent cannot install connectors itself. See `buildMcpInstallCard` in `public/app.js`.

**Memory** — Cross-conversation user facts kept in `workspace/memory.md`. The agent appends dated bullets silently; the file is injected into the first-turn preamble when `memoryEnabled` is on. See [Memory and personalization](../features/memory-and-personalization.md).

**Preamble** — The system context prepended to the first turn of each conversation (`buildPreamble` in `server/prompts.js`): persona rules, memory, nickname, custom instructions, and project context.

**Project** — A named grouping of chats with its own instructions and uploaded files (under `workspace/projects/<id>/`). Project context is injected into the preamble for chats that belong to it. See [Projects](../features/projects.md).

**Research mode** — A per-turn protocol selected in the composer: **Wide** (breadth-first sweep across many angles and sources) or **Deep** (iterative depth-first investigation with a `research_notes.md` scratchpad). Prepended to the turn by `researchProtocol` in `server/prompts.js`. See [Deep research](../features/deep-research.md).

**Sandbox** — The OS-level isolation Codex runs commands in. MockChatGPT uses `sandboxMode: "workspace-write"` with `networkAccessEnabled: true`, so the agent can read/write inside `workspace/` and reach the network, but not touch the rest of the filesystem.

**Scheduled task** — A saved prompt that runs on a schedule (interval, daily, weekly, or once). Each run is a real agent turn logged into a dedicated "⏰" conversation. Managed by `server/scheduler.js`. See [Scheduled tasks](../features/scheduled-tasks.md).

**SSE (server-sent events)** — The one-way streaming transport from server to browser for chat. The chat endpoint writes `data: <json>\n\n` frames; the client parses them in `app.js`. See [SSE chat pipeline](../systems/sse-chat-pipeline.md).

**Thread** — A persistent Codex conversation. One thread per app conversation, identified by `threadId` and resumed with `resumeThread` so context survives restarts.

**Turn** — One request/response cycle with the agent: the user's message plus everything the agent does before returning a final answer. A turn can emit many items and multiple `agent_message` items.

**Workspace** — The `workspace/` directory: the agent's sandbox root, containing `AGENTS.md`, `uploads/`, `generated/`, `projects/`, and `memory.md`.
