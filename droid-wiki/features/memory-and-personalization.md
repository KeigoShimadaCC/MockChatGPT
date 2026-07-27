# Memory and personalization

MockChatGPT personalizes first-turn context using persistent memory, nickname, and custom instructions from settings. Memory is stored in `workspace/memory.md`, is editable in Settings, and is injected into the preamble only when `memoryEnabled` is on.

## Purpose

Carry stable user context across conversations while keeping controls explicit in the UI.

## How it works

```mermaid
flowchart LR
  UI[Settings modal<br/>nickname, instructions, memory toggle + editor] --> API[`PUT /api/settings` + `PUT /api/memory`]
  API --> Store[`data/settings.json` + `workspace/memory.md`]
  Store --> Preamble[`buildPreamble(projectId)`]
  Preamble --> Chat[First turn on a conversation thread]
```

- Settings modal (`public/app.js`) loads `/api/settings` and `/api/memory`, then saves both on "Save".
- `server/store.js` persists:
  - settings in `SETTINGS_FILE` (`data/settings.json`);
  - memory text in `MEMORY_FILE` (`workspace/memory.md`).
- `buildPreamble()` (`server/prompts.js`) assembles:
  - base `<system_context>`;
  - optional `<user_memory>` if `settings.memoryEnabled !== false` and memory is non-empty;
  - optional `<user_profile>` from `settings.nickname`;
  - optional `<custom_instructions>` from `settings.customInstructions`.
- The preamble is only added on first turn (`isFirstTurn`) in `server/index.js`.

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Settings modal read/write flow, memory editor, and toggle behavior |
| `server/index.js` | `/api/memory` and `/api/settings` routes plus first-turn preamble injection |
| `server/prompts.js` | Canonical preamble assembly (`buildPreamble`) |
| `server/store.js` | Storage for memory/settings and defaults (`memoryEnabled: true`, empty nickname/instructions) |
| `workspace/AGENTS.md` | Runtime rule that durable facts should be appended/edited in `memory.md` |

## Integration points

- Settings and memory endpoints are part of [REST endpoints](../api/rest-endpoints.md) and [API overview](../api/index.md).
- First-turn behavior plugs into [Chat and streaming](chat-and-streaming.md) and [Codex integration](../systems/codex-integration.md).
- Data locations and schemas tie into [Persistence](../systems/persistence.md), [Data models](../reference/data-models.md), and [Configuration](../reference/configuration.md).

## Entry points for modification

- Add/remove personalization fields: extend settings UI in `public/app.js`, then persist via `/api/settings` and `readSettings()/writeSettings()` in `server/store.js`.
- Change what gets injected into first-turn context: edit `buildPreamble()` in `server/prompts.js`.
- Change how memory is edited or gated: adjust the settings modal and `memoryEnabled` checks.
