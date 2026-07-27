# API overview

MockChatGPT exposes a local HTTP API for app state plus an SSE endpoint for chat streaming. The server is designed for localhost use, with no auth layer on these routes. This page maps the endpoint families and data transport types.

## Base URL and access model

- Base URL: `http://localhost:3939` (or `http://localhost:<PORT>` if `PORT` is set)
- Scope: localhost-only runtime
- Auth: unauthenticated local API surface
- JSON parser limit: `10mb` (`express.json({ limit: "10mb" })`)

Security posture details: [Security](../security.md).

## Transport types

| Type | Used by | Notes |
|---|---|---|
| JSON request/response | Most `/api/*` routes | `Content-Type: application/json` |
| Multipart form data | Upload routes | `multer`-based file handling |
| Server-Sent Events (SSE) | `POST /api/conversations/:id/messages` | `text/event-stream`, heartbeat `: ping` every 15s |
| Static file serving | `/`, `/files`, `/vendor/*` | Frontend, workspace files, vendored client libs |

## Endpoint families

| Family | Routes | Reference |
|---|---|---|
| Conversations metadata | `/api/conversations`, `/api/conversations/:id` | [REST endpoints](rest-endpoints.md#conversations-metadata) |
| Chat stream (SSE) | `/api/conversations/:id/messages` | [REST endpoints](rest-endpoints.md#chat-stream-sse) |
| Projects | `/api/projects`, `/api/projects/:id`, `/api/projects/:id/files` | [REST endpoints](rest-endpoints.md#projects) |
| Scheduled tasks | `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/run` | [REST endpoints](rest-endpoints.md#scheduled-tasks) |
| MCP connectors | `/api/mcp`, `/api/mcp/install`, `/api/mcp/:name` | [REST endpoints](rest-endpoints.md#mcp-connectors) |
| Global uploads | `/api/upload` | [REST endpoints](rest-endpoints.md#global-uploads) |
| Memory/settings | `/api/memory`, `/api/settings` | [REST endpoints](rest-endpoints.md#memory-and-settings) |
| Static mounts | `/`, `/files`, `/vendor/*` | [REST endpoints](rest-endpoints.md#static-mounts) |

## Related docs

- [REST endpoints](rest-endpoints.md)
- [SSE chat pipeline](../systems/sse-chat-pipeline.md)
- [Codex integration](../systems/codex-integration.md)
- [Architecture](../overview/architecture.md)
