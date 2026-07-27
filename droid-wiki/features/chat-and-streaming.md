# Chat and streaming

This is the core user loop: type in the composer, send a message, watch live activity updates, and receive a markdown answer. The UI persists and replays the assistant timeline (`message.activities`) so reopened chats keep their "thinking" history.

## Purpose

Describe the user-visible chat behavior without duplicating low-level stream protocol details.

## How it works

```mermaid
sequenceDiagram
  participant U as User UI (`public/app.js`)
  participant A as API (`POST /api/conversations/:id/messages`)
  participant C as Codex (`runTurn`)
  participant S as Conversation store (`data/conversations/*.json`)

  U->>A: send `{text, attachments, researchMode}`
  A->>S: append user message; auto-title if `"New chat"`
  A->>C: stream turn events
  C-->>U: `activity`, `assistant_delta`, `assistant`, `done`
  A->>S: append assistant `{text, activities, durationMs}`
  U->>U: render markdown + code blocks + replayable timeline
```

- The composer sends on Enter (Shift+Enter for newline) and supports stop/abort while streaming (`sendMessage`, `setStreaming`).
- The live panel opens as `"Thinking…"` and updates from streamed `activity` events; on completion it collapses to `"Worked for Xs"` (`addAssistantShell`, `finalizeShell`).
- Reopening a conversation replays stored `m.activities` with `done: true` (`renderConversation`), so the timeline is not transient.
- Assistant text is rendered through `marked`, sanitized by `DOMPurify`, and code-highlighted with `hljs` (`renderMarkdown`).

For SSE internals, see [SSE chat pipeline](../systems/sse-chat-pipeline.md). For Codex thread/stream mapping, see [Codex integration](../systems/codex-integration.md).

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Composer behavior, stream consumption, timeline UI, markdown/code rendering, sidebar grouping, model/research pickers |
| `server/index.js` | Chat SSE endpoint, input assembly, auto-title logic, and persistence writes |
| `server/codexClient.js` | Event mapping (`agent_message`, `reasoning`, `command_execution`, `web_search`, etc.) to UI activity events |
| `server/store.js` | Conversation metadata/list ordering and persisted message structure |

## Integration points

- Uses `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id`, `PATCH /api/conversations/:id`, and `POST /api/conversations/:id/messages` (full definitions: [REST endpoints](../api/rest-endpoints.md)).
- Model and reasoning effort are saved to `/api/settings` and applied in `threadOptions()` (`opts.model`, `opts.modelReasoningEffort`).
- Research mode picker writes `currentMode` and sends it as `researchMode` per message; protocol text is injected by `researchProtocol()` (details: [Deep research](deep-research.md)).

## Entry points for modification

- Change message rendering or timeline UI: `renderMarkdown`, `buildAgentPanel`, `renderActivityEntry`, `renderConversation` in `public/app.js`.
- Change streamed event semantics: `runTurn()` in `server/codexClient.js`.
- Change title heuristics or message persistence fields: `/api/conversations/:id/messages` handler in `server/index.js`.
- Change conversation list grouping buckets (`Today`, `Yesterday`, `Previous 7 Days`, `Previous 30 Days`, `Older`): `groupLabel()` in `public/app.js`.
