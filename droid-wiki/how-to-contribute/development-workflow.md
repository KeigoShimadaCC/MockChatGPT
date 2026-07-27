# Development workflow

This project uses a local-only, manual development cycle. There is no CI pipeline or automated tests in the repository, so validation is done by running the app and checking behavior directly.

## Typical branch to commit cycle

1. Create or switch to your working branch.
2. Start the app with `npm start` or `npm run dev`.
3. Implement changes in the relevant area (`public/` or `server/`).
4. Verify manually (API/SSE/browser checks).
5. Review diff, then commit with a clear message.

## Local run modes

| Command | Use |
|---|---|
| `npm start` | Run `node server/index.js` on `http://localhost:3939` (or `PORT` override) |
| `npm run dev` | Run `node --watch server/index.js` for backend auto-restart on file changes |

## Mandatory restart rule for backend edits

If you edited files under `server/` and are not running `npm run dev`, restart the process before testing:

```bash
pkill -f "node server/index.js"; npm start &
```

There is no hot reload under `npm start`.

## Frontend update behavior

Frontend files in `public/` are served directly. No build is required, so a browser refresh picks up HTML/CSS/JS changes.

## Manual verification during development

- Run the SSE smoke test from [Testing](testing.md) for backend and chat pipeline changes.
- Verify UI behavior in browser for frontend changes.
- For uploads, prefer API-based upload checks when using Playwright MCP because native file pickers are intercepted.

## Commit checklist

- [ ] Relevant manual checks passed
- [ ] No accidental edits to runtime state in `data/` or `workspace/` artifacts
- [ ] Diff reviewed for scope
- [ ] Commit message explains intent

Related: [Patterns and conventions](patterns-and-conventions.md), [SSE chat pipeline](../systems/sse-chat-pipeline.md), [Data models](../reference/data-models.md).
