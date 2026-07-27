# Data models

MockChatGPT persists most state as plain JSON files under `data/`, with files and memory in `workspace/`. This page documents each shape with examples, field definitions, and storage location.

See also: [Persistence system](../systems/persistence.md).

## Conversation

**Stored in:** `data/conversations/<id>.json` (`CONV_DIR` in `server/store.js`)

```json
{
  "id": "8b3d3e9e-3cbf-4f4a-9c34-2c87d74c45e6",
  "title": "New chat",
  "projectId": null,
  "threadId": "thread_abc123",
  "messages": [
    {
      "role": "user",
      "text": "Say pong.",
      "attachments": [
        { "name": "sample.png", "url": "/files/uploads/1720012345-sample.png", "isImage": true }
      ],
      "ts": 1720012350000
    },
    {
      "role": "assistant",
      "text": "pong",
      "activities": [
        {
          "type": "activity",
          "id": "item_1",
          "kind": "reasoning",
          "label": "Thinking",
          "detail": "Short internal progress text",
          "done": true
        }
      ],
      "durationMs": 1432,
      "ts": 1720012351432
    }
  ],
  "createdAt": 1720012345000,
  "updatedAt": 1720012351432
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string (UUID) | Conversation id, also filename stem |
| `title` | string | Sidebar title |
| `projectId` | string \| null | Linked project id if conversation belongs to a project |
| `threadId` | string \| null | Codex thread id used for resume |
| `messages` | array | Ordered user/assistant message history |
| `createdAt` | number (epoch ms) | Creation timestamp |
| `updatedAt` | number (epoch ms) | Last write timestamp |

### User message shape

| Field | Type | Meaning |
|---|---|---|
| `role` | `"user"` | Message role |
| `text` | string | Raw user text |
| `attachments` | array of attachment objects | Metadata for uploaded files shown in message |
| `ts` | number (epoch ms) | Message timestamp |

Attachment object:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Display filename |
| `url` | string | Browser URL under `/files/...` |
| `isImage` | boolean | Whether UI treats file as image |

### Assistant message shape

| Field | Type | Meaning |
|---|---|---|
| `role` | `"assistant"` | Message role |
| `text` | string | Final accumulated assistant markdown |
| `activities` | array of activity objects | Timeline of reasoning/tool/command/search events |
| `durationMs` | number | Turn runtime in milliseconds |
| `ts` | number (epoch ms) | Message timestamp |

### Activity shape

| Field | Type | Meaning |
|---|---|---|
| `type` | `"activity"` | Event marker |
| `id` | string \| null | Upstream event/item id |
| `kind` | `"reasoning"` \| `"command"` \| `"search"` \| `"file"` \| `"tool"` \| `"plan"` \| `"error"` | Activity category |
| `label` | string | UI label |
| `detail` | string | Main detail text |
| `output` | string \| undefined | Command output snippet (when present) |
| `exitCode` | number \| undefined | Command exit code (when present) |
| `done` | boolean | Completion state |

## Project

**Stored in:** `data/projects.json` (`PROJECTS_FILE` in `server/store.js`)

```json
[
  {
    "id": "9c198f6e-4cad-4ad8-bcaf-fd17bd6d7dc2",
    "name": "Fund II research",
    "instructions": "Prefer primary sources.",
    "createdAt": 1720012000000
  }
]
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string (UUID) | Project id |
| `name` | string | Project name (trimmed, max 60 chars by server) |
| `instructions` | string | Prompt context applied to project conversations |
| `createdAt` | number (epoch ms) | Creation timestamp |

## Task

**Stored in:** `data/tasks.json` (`TASKS_FILE` in `server/scheduler.js`)

```json
[
  {
    "id": "46f7cf4c-4eb8-45ff-b4f4-3a34d44e8f6b",
    "prompt": "Summarize top AI headlines.",
    "schedule": { "type": "daily", "time": "09:00" },
    "enabled": true,
    "conversationId": "8b3d3e9e-3cbf-4f4a-9c34-2c87d74c45e6",
    "lastRun": 1720013000000,
    "lastStatus": "ok",
    "nextRun": 1720099200000,
    "createdAt": 1720012500000
  }
]
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string (UUID) | Task id |
| `prompt` | string | Instruction executed per scheduled run |
| `schedule` | object | Recurrence definition (see variants below) |
| `enabled` | boolean | Whether scheduler executes it |
| `conversationId` | string \| null | Conversation used to store run history |
| `lastRun` | number \| null | Last run timestamp |
| `lastStatus` | string \| null | Last status (`ok` or `error: ...`) |
| `nextRun` | number \| null | Next due timestamp (null for disabled/once-complete) |
| `createdAt` | number (epoch ms) | Creation timestamp |

Schedule variants:

```json
{ "type": "interval", "minutes": 60 }
```

```json
{ "type": "daily", "time": "09:00" }
```

```json
{ "type": "weekly", "weekday": 1, "time": "09:00" }
```

```json
{ "type": "once", "at": "2026-07-27T01:00:00.000Z" }
```

## Settings

**Stored in:** `data/settings.json` (`SETTINGS_FILE` in `server/store.js`)

```json
{
  "customInstructions": "",
  "nickname": "",
  "memoryEnabled": true,
  "model": "",
  "reasoningEffort": ""
}
```

| Field | Type | Meaning |
|---|---|---|
| `customInstructions` | string | User-defined behavior guidance |
| `nickname` | string | Preferred name in preamble |
| `memoryEnabled` | boolean | Enables/disables memory injection into preamble |
| `model` | string | Optional Codex model override |
| `reasoningEffort` | string | Optional Codex reasoning effort override |

## App-installed MCP connector names

**Stored in:** `data/mcp-app-installed.json` (`APP_INSTALLED_FILE` in `server/mcp.js`)

```json
["playwright", "context7"]
```

| Field | Type | Meaning |
|---|---|---|
| array item | string | MCP server name installed through this app UI |

## Upload response object (API, not on-disk)

**Returned by:** `POST /api/upload` in `server/index.js`

```json
{
  "name": "report.pdf",
  "path": "/absolute/path/to/workspace/uploads/1720012345-report.pdf",
  "relPath": "uploads/1720012345-report.pdf",
  "url": "/files/uploads/1720012345-report.pdf",
  "mime": "application/pdf",
  "isImage": false
}
```

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Original filename |
| `path` | string | Absolute server filesystem path |
| `relPath` | string | Path relative to workspace root |
| `url` | string | Browser-accessible URL served from `/files` |
| `mime` | string | MIME type from upload metadata |
| `isImage` | boolean | True when MIME starts with `image/` |
