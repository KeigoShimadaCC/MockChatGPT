# Connectors

Connectors are MCP servers that extend what the agent can do. The app provides a Connectors modal for installed servers, curated catalog installs, and custom command installs, then executes changes through `codex mcp` on the local machine.

## Purpose

Manage Codex MCP servers from the chat UI, including approval-driven installs proposed by the agent in conversation.

## How it works

```mermaid
flowchart TD
  UI[Connectors modal<br/>installed + catalog + custom add] --> API[`GET /api/mcp`]
  API --> MCP[`listServers()` in `server/mcp.js`]
  MCP --> CodexCLI[`codex mcp list --json`]
  UI --> Install[`POST /api/mcp/install`]
  Install --> CodexAdd[`codex mcp add ...`]
  UI --> Remove[`DELETE /api/mcp/:name`]
  Remove --> CodexRm[`codex mcp remove <name>`]
  Agent[Assistant sends ```mcp-install JSON block] --> Card[`buildMcpInstallCard()`]
  Card --> Install
```

- `server/mcp.js` defines a curated `CATALOG` sourced from `docs/03-mcp-options.md`: `playwright`, `chrome-devtools`, `context7`, `memory`, `fetch`, `duckduckgo`, `markitdown`, `hf-spaces`.
- `listServers()` merges:
  - actual installed servers from `codex mcp list --json`,
  - catalog availability (`which(c.needs)` checks such as `uv`/`uvx`),
  - app-installed markers from `data/mcp-app-installed.json`.
- `installServer()` validates `name` with `/^[\w-]{1,40}$/`, supports `--url` or `-- <command> <args...>`, and validates `env` keys before adding `--env KEY=VALUE`.
- `removeServer()` validates name and removes both Codex config entry and app-installed marker.

### In-chat proposal flow

- The runtime persona (`workspace/AGENTS.md`) instructs the agent to propose connector installs via fenced code block language `mcp-install` (JSON payload).
- `renderMarkdown()` detects `language-mcp-install` and replaces the code block with `buildMcpInstallCard(...)`.
- The card shows command/url, optional env inputs, and an **Approve & install** button.
- Clicking approve calls `POST /api/mcp/install`; only then is the connector installed.

### Scope of effect

Connector changes are global to the local Codex installation, not just this app session. The UI uninstall confirmation explicitly warns: `"This affects all Codex sessions, not just this app."`

## Key source files

| File | Why it matters |
|---|---|
| `public/app.js` | Connectors modal rendering, catalog/custom install actions, uninstall flow, and `mcp-install` card renderer |
| `server/index.js` | `/api/mcp`, `/api/mcp/install`, and `/api/mcp/:name` routes |
| `server/mcp.js` | Catalog, `codex mcp` execution wrapper, availability checks, install/remove validations |
| `workspace/AGENTS.md` | In-chat proposal protocol for connector requests (`mcp-install` fenced JSON) |
| `docs/03-mcp-options.md` | Research source behind curated connector choices |

## Integration points

- API details live in [REST endpoints](../api/rest-endpoints.md) and [API overview](../api/index.md).
- Connector proposals appear in the same assistant markdown rendering path described in [Chat and streaming](chat-and-streaming.md).
- Configuration/persistence context: [Configuration](../reference/configuration.md), [Persistence](../systems/persistence.md), and [Architecture](../overview/architecture.md).

## Entry points for modification

- Add or remove curated connectors: edit `CATALOG` in `server/mcp.js`.
- Change custom install UX or env handling: update Connectors modal handlers and `buildMcpInstallCard()` in `public/app.js`.
- Change validation/security rules for install input: `installServer()` in `server/mcp.js`.
