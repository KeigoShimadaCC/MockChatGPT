# Testing

MockChatGPT currently has no automated test suite. Validation is manual and should be scoped to the subsystem you changed: API/SSE, frontend UI, files/uploads, or scheduled tasks.

## Current testing reality

- No unit test framework
- No integration test harness
- No lint or type-check pipeline
- No build validation step

Use repeatable manual checks before committing.

## Primary backend smoke test (curl + SSE)

Use this exact two-command flow to verify conversation creation and chat streaming:

```bash
CONV=$(curl -s -X POST localhost:3939/api/conversations | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -N -X POST localhost:3939/api/conversations/$CONV/messages \
  -H "Content-Type: application/json" -d '{"text":"Say pong."}'
```

Expected result: streamed SSE events ending with `{ "type": "done", "threadId": "..." }` (or an `{ "type": "error" }` event if the turn fails).

## Browser verification

Use browser checks for UI behavior, message rendering, modals, and interaction flow. Playwright MCP is useful for visual and interaction verification.

### File upload caveat with Playwright MCP

The Playwright MCP browser can intercept native file choosers. For upload validation, call the upload API directly:

```bash
curl -s -X POST localhost:3939/api/upload -F "files=@/absolute/path/to/file"
```

## What to check by subsystem

| Subsystem | Manual checks |
|---|---|
| Conversations + SSE chat | Create conversation, send message, observe `activity`/`assistant`/`done` events |
| Frontend (`public/`) | Sidebar/chat rendering, composer behavior, markdown/code rendering, modal open/close states |
| Projects/files | Create/update/delete project, upload/list project files |
| Tasks scheduler | Create task, trigger `POST /api/tasks/:id/run`, confirm conversation output/logs |
| MCP connectors | List/install/remove via `/api/mcp` endpoints and verify response fields |
| Memory/settings | Read/write via `/api/memory` and `/api/settings`, then confirm behavior on next turn |

## Related docs

- [API index](../api/index.md)
- [REST endpoints](../api/rest-endpoints.md)
- [SSE chat pipeline](../systems/sse-chat-pipeline.md)
- [Codex integration](../systems/codex-integration.md)
