# Dependencies

MockChatGPT keeps a small runtime dependency set: six npm packages and one external CLI dependency (`codex`). There are no `devDependencies`, and browser libraries are served locally from `node_modules` (not from a CDN).

## Runtime npm dependencies

Source: `package.json`

| Package | Version | Role | Client/server |
|---|---|---|---|
| `@openai/codex-sdk` | `latest` | Core agent SDK (`Codex` threads, streamed runs) | Server |
| `express` | `^4.19.2` | HTTP API, static serving, SSE endpoint | Server |
| `multer` | `^1.4.5-lts.1` | Multipart upload parsing/storage | Server |
| `marked` | `^14.1.0` | Markdown to HTML rendering | Client (served by server from `node_modules`) |
| `dompurify` | `^3.1.6` | HTML sanitization before DOM insertion | Client (served by server from `node_modules`) |
| `@highlightjs/cdn-assets` | `^11.10.0` | Syntax highlighting assets | Client (served by server from `node_modules`) |

## External non-npm dependency

| Dependency | Role | Where used |
|---|---|---|
| `codex` CLI (globally installed, authenticated via `codex login`) | Underlying local engine/session auth used by Codex SDK; also manages MCP connectors (`codex mcp ...`) | `server/codexClient.js`, `server/mcp.js`, operational setup |

## Notes

- `package.json` defines **no `devDependencies`**.
- Client-side libraries are **vendored via Express routes**:
  - `/vendor/marked.js`
  - `/vendor/purify.js`
  - `/vendor/hljs/*`
- Most notable operational dependency is `@openai/codex-sdk` + local `codex` CLI pairing, because model execution/auth and MCP tool registry depend on local Codex state.
- The oldest-looking package line is `multer@^1.4.5-lts.1` (LTS stream).

Related docs: [Codex integration](../systems/codex-integration.md), [Connectors](../features/connectors.md), [Getting started](../overview/getting-started.md).
