# Patterns and conventions

The conventions that keep MockChatGPT small and predictable. Read this before changing code; several rules exist because the alternative caused a real bug.

## Language and module style

- **ES modules everywhere.** `package.json` sets `"type": "module"`. Use `import`/`export`, not `require`.
- **Node >= 20.** The code uses `crypto.randomUUID()` (global), top-level `import`, and `--watch` for dev.
- **No TypeScript, no build step.** Both server and frontend are plain JS run as-is. Do not introduce a bundler or transpiler.

## Frontend conventions

- **Dependency-free vanilla JS.** `public/app.js` uses a tiny `$ = (sel) => document.querySelector(sel)` helper and direct DOM APIs. No framework, no reactive state library. Keep it that way.
- **Vendor client libs, never CDN.** `marked`, `dompurify`, and `highlight.js` are served from `node_modules` via express static mounts (`/vendor/marked.js`, `/vendor/purify.js`, `/vendor/hljs`). New client libraries must be vendored the same way.
- **Always sanitize rendered markdown.** `renderMarkdown` runs `DOMPurify.sanitize(marked.parse(...))` before inserting HTML. Never bypass this.
- **CSS overrides the `hidden` attribute.** Any always-styled container needs an explicit `[hidden] { display: none; }` rule, or it will show even when `hidden` is set (see `#modal-backdrop`, `#model-menu` in `app.css`).
- **User-bubble sizing lives on `.msg-box`.** Keep `max-width` on `.msg-box`, not `.bubble`; a percentage max-width on the bubble against a content-sized parent collapses short messages.
- **Preserve the ChatGPT look.** UI changes should match the existing visual language (sidebar, composer, modals, code-block chrome).

## Server conventions

- **Thin routes, logic in modules.** `server/index.js` holds Express routes; persistence, Codex, scheduling, prompts, and MCP each live in their own module. Route handlers stay small and delegate.
- **JSON files as the database.** `store.js` reads/writes JSON under `data/`. Every mutation goes through a `save*` helper that serializes with `JSON.stringify(x, null, 2)`. There is no ORM and no external DB.
- **Validate IDs before touching the filesystem.** `convPath` rejects ids that do not match `/^[\w-]+$/`; project/task ids come from `crypto.randomUUID()`. Sanitize any path segment derived from user input (see the upload routes' `replace(/[^\w.\-() ]/g, "_")`).
- **Restart after server edits.** There is no hot reload under `npm start`. Use `npm run dev` (`--watch`) or `pkill -f "node server/index.js"; npm start &`.

## Codex event handling

- **Accumulate `agent_message` items; never keep only the last.** Codex emits several whole `agent_message` items per turn (progress notes plus the final answer) and there are no token-level deltas. `runTurn` pushes completed messages into `parts[]` and joins them. Breaking this loses text.
- **Handle both event shapes for reasoning.** Exec-style events expose reasoning as `item.text`; the app-server protocol uses `summary`/`content` arrays. `codexClient.js` handles whichever arrives.
- **Model and effort are read per turn.** `threadOptions()` re-reads settings on every turn, so a model/effort change applies to existing conversations, not just new ones.
- **Truncate command output.** Command `aggregated_output` is truncated to ~4000 chars before being sent to the client.

## Prompts and persona

- **Two distinct instruction sources.** The per-turn preamble is built in `server/prompts.js` (`buildPreamble`); the standing persona is `workspace/AGENTS.md`. Editing the latter changes the chat app's behavior. Keep developer guidance in the repo-root `AGENTS.md` / `CLAUDE.md`.
- **The agent must not mention Codex.** Both the preamble and the workspace persona instruct the agent to present itself only as "MockChatGPT" and never reference Codex, sandboxes, or these files.
- **Preamble only on the first turn.** `buildPreamble` output is prepended only when `conv.threadId` is unset; later turns rely on the persisted thread.

## Files the agent produces

- The agent saves generated artifacts under `workspace/generated/` and references them in replies as `![desc](/files/generated/<name>)` (images) or `[name](/files/generated/<name>)` (other files). The `/files` static mount maps to `workspace/`.

## Security posture

- **Localhost only.** The agent can run code and reach the network from its sandbox. Never bind the port to a public interface. See [Security](../security.md).
- **No secrets in the repo.** Auth is entirely via `codex login`; there is no API key anywhere. Do not add one.

## Naming and formatting

- Two-space indentation, semicolons, double-quoted strings (matches the existing files).
- Comments are sparse and explain non-obvious constraints (e.g., why agent messages are accumulated), not what the code plainly does. Follow that style.

For where to make specific changes, see the [Systems](../systems/index.md) pages and [Development workflow](development-workflow.md).
