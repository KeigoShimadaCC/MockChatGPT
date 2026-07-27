# File and image handling

Users can attach files by button, drag/drop, or paste. The server stores uploads under `workspace/uploads`, passes image attachments to Codex as `local_image`, and announces non-image files by relative path so the agent can open them.

## Purpose

Support document/image-assisted chats and generated output files through one workspace-backed flow.

## How it works

```mermaid
flowchart TD
  UI[Attach button / drag-drop / paste<br/>`uploadFiles()`] --> UPL[`POST /api/upload`]
  UPL --> WS[`workspace/uploads/*` via `multer`]
  WS --> MSG[`POST /api/conversations/:id/messages` with attachment metadata]
  MSG --> INPUT[Server builds Codex input]
  INPUT --> IMG[Images -> `{type:\"local_image\", path}`]
  INPUT --> NONIMG[Non-images -> prompt note with `relPath`]
  Agent[Agent reads files per persona rules] --> GEN[Writes outputs under `generated/`]
  GEN --> UI2[UI renders `/files/generated/...` links/images]
```

- `public/app.js` keeps pending attachments in `pendingAttachments`, uploads via `FormData`, and displays chips/previews.
- `/api/upload` (`server/index.js`) accepts up to 8 files (`50MB` each), stores them in `UPLOADS_DIR`, and returns `{name, path, relPath, url, mime, isImage}`.
- In `/api/conversations/:id/messages`:
  - image files are converted into Codex input items: `{ type: "local_image", path: path.join(WORKSPACE, a.relPath) }`;
  - non-image files are listed in prompt text: `[The user attached files, available in your workspace: ...]`.

### Persona file-reading and generation rules

`workspace/AGENTS.md` sets runtime handling rules:

- Read text-ish files (`txt`, `md`, `csv`, `tsv`, `json`, code) directly.
- Office files (`docx`, `xlsx`, `pptx`) via zip + XML parsing (`zipfile` + XML).
- PDFs via `pdftotext`, or fallback to a venv with `pip install pypdf` (and `strings` as last resort).
- Generated artifacts go under `generated/` and must be linked as:
  - images: `![description](/files/generated/<filename>)`
  - other files: `[name](/files/generated/<filename>)`

`server/prompts.js` reinforces image/artifact generation in `<system_context>`: prefer built-in `image_gen` when available; otherwise create SVG or Python (`matplotlib`/`Pillow`) outputs in `generated/`.

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Upload UX (`+`, drag/drop, paste), attachment preview chips, and send payload wiring |
| `server/index.js` | Upload route (`/api/upload`), chat attachment-to-input conversion, `/files` static serving |
| `server/store.js` | Workspace path constants (`WORKSPACE`, `UPLOADS_DIR`, `GENERATED_DIR`) |
| `workspace/AGENTS.md` | Runtime rules for reading uploaded formats and publishing generated artifacts |
| `server/prompts.js` | First-turn capability instructions for image/chart/file generation |

## Integration points

- API references: [API overview](../api/index.md) and detailed routes in [REST endpoints](../api/rest-endpoints.md).
- Chat pipeline dependency: [Chat and streaming](chat-and-streaming.md) and [SSE chat pipeline](../systems/sse-chat-pipeline.md).
- Persistence path details: [Persistence](../systems/persistence.md), [Data models](../reference/data-models.md), and [Architecture](../overview/architecture.md).

## Entry points for modification

- Adjust upload limits/count: `multer` config in `server/index.js` (`/api/upload` and project upload routes).
- Change attachment rendering or input UX: `uploadFiles()`, paste/drop handlers, and preview rendering in `public/app.js`.
- Change generated-file conventions or read fallbacks: `workspace/AGENTS.md` and first-turn capability text in `server/prompts.js`.
