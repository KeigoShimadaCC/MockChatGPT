# MockChatGPT — agent guide

ChatGPT-lookalike chat app powered by the OpenAI Codex SDK (`@openai/codex-sdk`), running on the user's ChatGPT subscription via `codex login`. Single user, localhost only.

## Commands

```bash
npm start                 # serve on http://localhost:3939 (PORT env to change)
npm run dev               # same, with --watch
# restart after server changes (targeted: the broad pattern
# 'node server/index.js' would also kill servers running in git worktrees):
pkill -f "Documents/MockChatGPT/server/index.js"; npm start &
```

There is no build step (vanilla JS frontend, no bundler) and no test suite — verify changes by hitting the running server:

```bash
# smoke: send a message end-to-end (SSE stream prints events)
CONV=$(curl -s -X POST localhost:3939/api/conversations | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -N -X POST localhost:3939/api/conversations/$CONV/messages \
  -H "Content-Type: application/json" -d '{"text":"Say pong."}'
```

## Layout

- `server/index.js` — Express routes + SSE chat endpoint; also serves vendored client libs straight out of `node_modules` (marked, dompurify, highlight.js)
- `server/codexClient.js` — Codex thread options + event → SSE mapping
- `server/prompts.js` — first-turn preamble (memory, nickname, custom instructions)
- `server/store.js` — JSON persistence (`data/`), workspace paths
- `public/` — single-page vanilla JS UI (`index.html`, `app.js`, `app.css`); no framework, keep it that way
- `workspace/` — the embedded Codex agent's sandbox (uploads/, generated/, memory.md)
- `data/` — conversations + settings JSON (gitignored)

## ⚠️ workspace/AGENTS.md is not this file

`workspace/AGENTS.md` is the **runtime persona** injected into the app's embedded Codex engine ("you are MockChatGPT…"). It is product content, not developer guidance. Editing it changes the chat app's behavior; keep dev instructions here.

## Gotchas (learned the hard way)

- Codex emits **multiple whole `agent_message` items per turn** (progress notes + final). Accumulate them (`server/codexClient.js`); never keep only the last. There are no token-level deltas.
- Each conversation maps to a persistent Codex thread (`conv.threadId`, resumed with `resumeThread`). Model/effort settings are re-read per turn, so they apply to existing conversations too.
- Cancelling a turn = `thread.runStreamed(input, { signal })`. The SDK passes that `AbortSignal` to the `spawn()` of `codex exec`, so aborting SIGTERMs the child. Two traps: the kill races the AbortError (the stream may instead throw a plain `Codex Exec exited with signal SIGTERM` — check `signal.aborted`, not the error name), and grandchildren of `codex exec` (a shell command it launched) are *not* killed with it, so a long-running command can outlive the turn.
- Codex threads are stateful and can't be forked, so there is no true history rewrite. "Regenerate"/"edit" (`replaceLast` on the messages endpoint) send an extra instruction turn to the thread and rewrite only the *stored* transcript.
- Author CSS overrides the HTML `hidden` attribute — any always-styled container needs an explicit `[hidden] { display: none; }` rule (see `#modal-backdrop`, `#model-menu`).
- User-bubble sizing: keep max-width on `.msg-box`, not `.bubble` (a % max-width on the bubble against a content-sized parent collapses short messages).
- The Codex sandbox is `workspace-write` **with network access enabled** (needed for pip-installing PDF parsers). Never expose the port beyond localhost.
- `codex login` (ChatGPT account) must be done once on the machine; no API key is used anywhere.

## Conventions

- ES modules everywhere (`"type": "module"`).
- Frontend stays dependency-free vanilla JS; new client libs must be vendored via an express static mount, not a CDN.
- UI changes should preserve the ChatGPT look (see screenshots in the repo history / README).
