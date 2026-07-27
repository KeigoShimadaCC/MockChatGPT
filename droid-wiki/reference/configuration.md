# Configuration

MockChatGPT has a small runtime config surface: one server port env var, a persisted settings object, and fixed Codex thread options. This page lists the exact values and where they are consumed in code.

## Server port

| Key | Default | Meaning | Source |
|---|---:|---|---|
| `PORT` | `3939` | Express listen port for the local app server | `server/index.js` (`const PORT = process.env.PORT || 3939`) |

## Settings object (`data/settings.json`)

The server merges incoming settings updates with the current object via `PUT /api/settings`, and `threadOptions()` re-reads settings every turn.

| Field | Type | Meaning | Where used |
|---|---|---|---|
| `customInstructions` | string | Extra response behavior instructions from user settings modal | Read by prompt-building flow (`server/prompts.js` via settings access path) and edited via `public/app.js` + `PUT /api/settings` |
| `nickname` | string | Preferred user name used in first-turn preamble | Read by prompt-building flow (`server/prompts.js` via settings access path) and edited via `public/app.js` + `PUT /api/settings` |
| `memoryEnabled` | boolean | Whether saved memory should be referenced in prompt preamble | Read by prompt-building flow (`server/prompts.js` via settings access path); edited in settings modal |
| `model` | string (`""` = Codex default) | Model id override for Codex thread options | `server/codexClient.js` sets `opts.model` when non-empty |
| `reasoningEffort` | string (`""` or UI presets) | Reasoning effort override for Codex thread options | `server/codexClient.js` sets `opts.modelReasoningEffort` when non-empty |

Default returned if file is missing:  
`{ customInstructions: "", nickname: "", memoryEnabled: true, model: "", reasoningEffort: "" }` (`server/store.js`).

## Fixed Codex thread options

These values are always set in `threadOptions()` before optional model/effort overrides.

| Option | Value | Meaning | Source |
|---|---|---|---|
| `workingDirectory` | `WORKSPACE` (`<repo>/workspace`) | Agent filesystem root | `server/codexClient.js`, `server/store.js` |
| `skipGitRepoCheck` | `true` | Allows operation without git enforcement in workspace | `server/codexClient.js` |
| `sandboxMode` | `"workspace-write"` | Agent may write inside workspace | `server/codexClient.js` |
| `networkAccessEnabled` | `true` | Agent can access network | `server/codexClient.js` |
| `webSearchEnabled` | `true` | Enables built-in web search capability | `server/codexClient.js` |
| `model` | optional from settings | Model override when non-empty | `server/codexClient.js` |
| `modelReasoningEffort` | optional from settings | Effort override when non-empty | `server/codexClient.js` |

## Model presets in the UI

Configured in `public/index.html` model menu:

| Value | Label in UI | Note |
|---|---|---|
| `""` | Default | Uses Codex default model from local config |
| `gpt-5.6-sol` | fast | Preset |
| `gpt-5.6-terra` | balanced | Preset |
| `gpt-5.6-luna` | most capable | Preset |
| `gpt-5.6-codex` | agentic coding | Preset |
| custom string | Custom model id | Entered in `#model-custom` |

Reasoning effort choices in the UI: `""` (Default), `minimal`, `low`, `medium`, `high`, `xhigh`.

## External Codex configuration

The app relies on the local Codex CLI environment (`codex login`, MCP registry, default model behavior). The UI explicitly references default model behavior as coming from `~/.codex` config (`public/index.html`: “Default from ~/.codex config”).

Connector list/install/remove operations call `codex mcp ...` through `execFile` in `server/mcp.js`.

## Directory layout constants

| Constant | Resolved path | Purpose | Source |
|---|---|---|---|
| `ROOT` | repo root | Base path | `server/store.js` |
| `DATA_DIR` | `data/` | Persistent JSON store root | `server/store.js` |
| `CONV_DIR` | `data/conversations/` | Conversation JSON files | `server/store.js` |
| `WORKSPACE` | `workspace/` | Agent working directory | `server/store.js` |
| `UPLOADS_DIR` | `workspace/uploads/` | General message uploads | `server/store.js` |
| `GENERATED_DIR` | `workspace/generated/` | Agent-generated files | `server/store.js` |
| `MEMORY_FILE` | `workspace/memory.md` | User memory text file | `server/store.js` |
| `SETTINGS_FILE` | `data/settings.json` | Settings persistence | `server/store.js` |
| `PROJECTS_FILE` | `data/projects.json` | Project metadata array | `server/store.js` |
| `PROJECT_FILES_DIR` | `workspace/projects/` | Per-project uploaded files | `server/store.js` |
| `TASKS_FILE` | `data/tasks.json` | Scheduled task definitions | `server/scheduler.js` |
| `APP_INSTALLED_FILE` | `data/mcp-app-installed.json` | App-tracked MCP connector names | `server/mcp.js` |

Related docs: [Persistence](../systems/persistence.md), [Codex integration](../systems/codex-integration.md), [Scheduled tasks](../features/scheduled-tasks.md), [Getting started](../overview/getting-started.md).
