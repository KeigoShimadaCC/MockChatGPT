# Getting started

This page covers prerequisites, install, and running MockChatGPT locally. There is no build step and no test suite; you verify changes by hitting the running server.

## Prerequisites

- **Node.js >= 20** (declared in `package.json` `engines`).
- **The Codex CLI**, logged in with a ChatGPT account. MockChatGPT drives the local `codex` binary; it never uses an API key.

```bash
npm install -g @openai/codex   # if you don't already have the Codex CLI
codex login                    # sign in with your ChatGPT account (once per machine)
```

`codex login` must be done once on the machine. Without it, every agent turn fails because the SDK cannot authenticate.

## Install and run

```bash
npm install
npm start                      # serves on http://localhost:3939
```

Set `PORT` to change the port:

```bash
PORT=8080 npm start
```

For development with auto-restart on server file changes:

```bash
npm run dev                    # node --watch server/index.js
```

There is no hot reload under `npm start`. After editing anything in `server/`, restart the process:

```bash
pkill -f "node server/index.js"; npm start &
```

The frontend (`public/`) has no build; a browser refresh picks up HTML/CSS/JS edits.

## First run

On startup the server ensures `data/` and the `workspace/` subdirectories exist (`store.js` creates them), warns if `workspace/AGENTS.md` is missing, and starts the task scheduler. Open http://localhost:3939 and you get the ChatGPT-style UI with an empty conversation list.

## Smoke test (no browser)

Because Codex turns can be slow (10s to a few minutes), the fastest backend check is a curl SSE test rather than a browser round-trip:

```bash
CONV=$(curl -s -X POST localhost:3939/api/conversations | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -N -X POST localhost:3939/api/conversations/$CONV/messages \
  -H "Content-Type: application/json" -d '{"text":"Say pong."}'
```

The second command streams the SSE events (`activity`, `assistant_delta`, `assistant`, `usage`, `done`) to your terminal.

## Where things live

- **Chats, settings, projects, tasks:** `data/` (JSON, gitignored).
- **Agent sandbox:** `workspace/` (`AGENTS.md`, `uploads/`, `generated/`, `projects/`, `memory.md`).
- **The agent's persona:** `workspace/AGENTS.md`. Editing it changes how the chat app behaves; it is product content, not developer guidance.

`data/` and the volatile parts of `workspace/` are gitignored. Do not commit them and do not wipe them while testing, since they hold real conversations and the user's memory.

## Deployment note

There is no deployment story beyond running it locally. The embedded Codex agent can execute code and access the network from its sandbox, so the port must stay bound to localhost. Never expose it publicly. See [Security](../security.md).

## Next steps

- Read the [Architecture](architecture.md) to understand the request lifecycle.
- Read [Patterns and conventions](../how-to-contribute/patterns-and-conventions.md) before making changes.
- Browse [Systems](../systems/index.md) for the backend internals or [Features](../features/index.md) for user-facing flows.
