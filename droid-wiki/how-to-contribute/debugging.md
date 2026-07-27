# Debugging

Most debugging in this repository is done by reading server console output and watching SSE events in a terminal. The app is local-only, so failures are usually process/runtime configuration issues rather than distributed infrastructure issues.

## Where logs go

- Server logs are written to the Node process console (`stdout`/`stderr`).
- Startup line:
  - `MockChatGPT running → http://localhost:<PORT>`
- Scheduler run line:
  - `[scheduler] running task: <prompt...>`
- Missing workspace persona warning:
  - `note: workspace/AGENTS.md missing`

## High-signal failure modes

| Symptom | Likely cause | What to check |
|---|---|---|
| SSE stream returns `{type:"error"}` on every turn | Codex CLI auth missing | Run `codex login` and retry |
| Turns appear stalled for a while | Codex turns can be slow (10s to minutes) | Keep SSE open; use curl smoke test instead of browser while iterating |
| Persona/instruction behavior is off | `workspace/AGENTS.md` missing or changed | Check warning at startup and file contents |
| API route returns `404`/`400` | Wrong ID or invalid/empty payload | Re-check request body and route params |
| Task did not run on schedule | Next-run timing or disabled task | Inspect `/api/tasks` fields (`enabled`, `nextRun`, `lastStatus`) and scheduler logs |

## SSE-specific debugging

For chat issues, prefer terminal streaming so you can see event order:

```bash
CONV=$(curl -s -X POST localhost:3939/api/conversations | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -N -X POST localhost:3939/api/conversations/$CONV/messages \
  -H "Content-Type: application/json" -d '{"text":"debug turn"}'
```

Look for:

- normal progression (`activity` and/or `assistant_delta`)
- final `assistant`, optional `usage`
- terminal `done`
- or `error` with message

## Quick troubleshooting runbook

1. Confirm server is running on expected port (`MockChatGPT running → ...`).
2. If you edited `server/`, restart the process (or use `npm run dev`).
3. Run the curl SSE smoke test to isolate backend vs UI issues.
4. If all turns fail, run `codex login`.
5. Check startup warning for `workspace/AGENTS.md`.
6. Reproduce with minimal payload and inspect response body/event stream.

Related: [Testing](testing.md), [REST endpoints](../api/rest-endpoints.md), [Codex integration](../systems/codex-integration.md).
