# How to contribute

MockChatGPT is a small localhost app with a vanilla-JS frontend and an Express backend. Contribution work is mostly a tight local loop: edit, restart the server when needed, and verify manually because there is no automated test suite. This section documents the practical workflow used in this repository.

## Prerequisites recap

- Node.js `>=20`
- Local Codex CLI installed and authenticated once with `codex login`
- Dependencies installed with `npm install`

See [Getting started](../overview/getting-started.md) for full setup details.

## Work pickup checklist

1. Read [Architecture](../overview/architecture.md) for component boundaries.
2. Read [Patterns and conventions](../how-to-contribute/patterns-and-conventions.md) before changing code.
3. Identify the target area:
   - Frontend: `public/`
   - Backend/API: `server/`
   - Runtime content/persona: `workspace/AGENTS.md`

## Core edit loop

1. Run the app:
   - `npm start` for normal run
   - `npm run dev` for `node --watch server/index.js`
2. Make your code changes.
3. If you changed anything in `server/`, restart when not using `npm run dev`:
   - `pkill -f "node server/index.js"; npm start &`
4. Refresh the browser for frontend changes.
5. Run manual checks (see [Testing](testing.md)).

## Definition of done

Since this repo has no test framework, done means:

- Changes follow repo conventions in [Patterns and conventions](../how-to-contribute/patterns-and-conventions.md).
- The relevant manual checks pass (API/SSE/browser path).
- No regressions observed in the affected flow.
- Changes are committed with a clear message.

## How-to pages in this section

- [Development workflow](development-workflow.md)
- [Testing](testing.md)
- [Debugging](debugging.md)
- [Tooling](tooling.md)
- [Patterns and conventions](patterns-and-conventions.md)

## Related docs

- [Getting started](../overview/getting-started.md)
- [Architecture](../overview/architecture.md)
- [SSE chat pipeline](../systems/sse-chat-pipeline.md)
- [Codex integration](../systems/codex-integration.md)
- [Configuration](../reference/configuration.md)
