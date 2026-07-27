See @AGENTS.md for project layout, commands, and gotchas.

# Claude-specific workflow

- Verify UI changes visually: drive the app with the Playwright MCP tools
  (navigate to http://localhost:3939, screenshot, compare against the ChatGPT
  look). Note: the Playwright browser intercepts native file choosers — test
  uploads via `curl -F` against `/api/upload` instead of clicking "+".
- Codex turns are slow (10s–3min). For backend checks prefer the curl SSE
  smoke test in AGENTS.md over browser round-trips; run long turns in the
  background.
- After editing anything in `server/`, restart the server before testing —
  there is no hot reload under `npm start`.
- Real conversations/settings live in `data/` and the user's memory in
  `workspace/memory.md`; they are gitignored — don't commit them and don't
  wipe them when testing.
