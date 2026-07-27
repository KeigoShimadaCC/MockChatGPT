# Tooling

This repository intentionally has a minimal toolchain. It runs plain JavaScript directly in Node and the browser, with no bundler, no transpiler, and no test/lint automation configured.

## Runtime and language

- Node.js `>=20`
- ES modules (`"type": "module"`)
- Express server + vanilla JS frontend

## npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm start` | `node server/index.js` | Start app server |
| `npm run dev` | `node --watch server/index.js` | Backend auto-restart during development |

## Frontend library delivery

Client libraries are vendored from `node_modules` and served by Express static mounts:

- `/vendor/marked.js` → `marked`
- `/vendor/purify.js` → `dompurify`
- `/vendor/hljs` → `@highlightjs/cdn-assets`

Do not switch these to CDN usage.

## External CLI dependency

The app depends on the globally installed Codex CLI binary:

- authentication via `codex login`
- MCP management via `codex mcp ...` (used by `server/mcp.js`)

Without `codex login`, agent turns fail.

## What does not exist

- No build system
- No bundler
- No TypeScript toolchain
- No linter config
- No formatter config
- No test framework
- No CI pipeline in this repository

## Practical implications

- Backend edits require process restart unless using `npm run dev`.
- Frontend edits require only browser refresh.
- Verification is manual; use the checks in [Testing](testing.md).

Related: [Getting started](../overview/getting-started.md), [Patterns and conventions](patterns-and-conventions.md), [Configuration](../reference/configuration.md).
