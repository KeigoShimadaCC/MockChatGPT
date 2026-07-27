# Projects

Projects group chats and files under a shared project context. The selected project filters the conversation sidebar, new chats inherit that `projectId`, and project instructions/files are injected into first-turn prompt context.

## Purpose

Keep related conversations and project-specific material together without changing the base chat UX.

## How it works

```mermaid
flowchart TD
  UI[Projects panel + modal<br/>create/edit/delete/select] --> API[`/api/projects` CRUD]
  API --> Meta[`data/projects.json`]
  UI --> ConvFilter[Sidebar filter by `selectedProjectId`]
  UI --> NewChat[`POST /api/conversations` with `{projectId}`]
  NewChat --> Preamble[`buildPreamble(projectId)` injects `<project ...>` block]
  FileUpload[`POST /api/projects/:id/files`] --> ProjectDir[`workspace/projects/<id>/`]
```

- `createProject()` and `updateProject()` store `name` and `instructions` in `data/projects.json` (`server/store.js`).
- Project files are uploaded with `/api/projects/:id/files` and stored under `PROJECT_FILES_DIR/<id>` (`workspace/projects/<id>/`).
- `buildPreamble(projectId)` adds a `<project name="...">` block on first turn, including:
  - project name;
  - note that files live under `projects/<project.id>/`;
  - optional "Project instructions" text.
- Selecting a project in the UI toggles `selectedProjectId`, filters visible chats, and starts new chats in that project.
- Deleting a project detaches chats instead of deleting them: `deleteProject()` sets matching conversation `projectId` to `null`.

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Project selector, project modal, project file upload list, conversation filtering, and project-bound chat creation |
| `server/index.js` | `/api/projects` CRUD and project file upload/list routes |
| `server/store.js` | `projects.json` persistence, per-project directory creation, and detach-on-delete logic |
| `server/prompts.js` | Project context injection into first-turn preamble |

## Integration points

- Endpoint-level behavior is listed in [REST endpoints](../api/rest-endpoints.md) and [API overview](../api/index.md).
- Project context is consumed by the chat turn path described in [Chat and streaming](chat-and-streaming.md) and [SSE chat pipeline](../systems/sse-chat-pipeline.md).
- Storage paths and records relate to [Persistence](../systems/persistence.md), [Data models](../reference/data-models.md), and [Architecture](../overview/architecture.md).

## Entry points for modification

- Change project metadata or validation rules: `createProject()/updateProject()` in `server/store.js`.
- Add richer project file management (rename/delete/download metadata): extend `/api/projects/:id/files` routes in `server/index.js` and project modal UI in `public/app.js`.
- Change project-scoped prompt behavior: edit `<project ...>` assembly in `buildPreamble()` in `server/prompts.js`.
