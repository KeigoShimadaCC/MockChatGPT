# Free MCP Servers to Extend a Codex-SDK Agent

**Researched:** July 2026
**Context:** We are building a ChatGPT-clone chat app on the OpenAI Codex SDK/CLI. Codex already gives us sandboxed shell/code execution, file read/write, web search, and local image input. This document surveys **free** (open-source or genuinely usable free tier) MCP servers that fill the gaps Codex does not cover natively.

---

## Summary: capability gap → best free MCP

| Capability gap | Best free option | Install | API key? | Confidence |
|---|---|---|---|---|
| **Image generation** | Hugging Face official MCP + a Gradio Space (e.g. `black-forest-labs/FLUX.1-schnell`) | `claude mcp add`-style HTTP to `https://huggingface.co/mcp`, or `npx @llmindset/mcp-hfspace` | Free HF account token | Medium — free-account ZeroGPU quota is the limit |
| **Image generation (fully local)** | ComfyUI MCP (`artokun/comfyui-mcp` for breadth, `joenorton/comfyui-mcp-server` for simplicity) | Python, needs local ComfyUI | No | Medium — needs a GPU box |
| **Image generation (zero-setup)** | Pollinations HTTP API directly (no MCP needed) | plain URL fetch | No (anon tier) | High for the API, **low for the MCP wrappers** — see caveat below |
| **Browser automation / computer use** | **Playwright MCP** (Microsoft) | `npx @playwright/mcp@latest` | No | **High** — 35.5k stars, the clear default |
| **Browser debugging (console/network/perf)** | Chrome DevTools MCP (Google) | `npx chrome-devtools-mcp@latest` | No | High |
| **Fetch a URL as markdown** | Official `fetch` reference server | `uvx mcp-server-fetch` | No | High |
| **Search + read pages (keyless)** | DuckDuckGo MCP | `uvx duckduckgo-mcp-server` | No | High — 1.4k stars, MIT |
| **Bulk scraping / crawling** | Crawl4AI-based MCP (self-hosted) | Python, several forks | No | Medium — many competing forks, pick one and pin it |
| **Filesystem (scoped, outside sandbox)** | Official `filesystem` server | `npx -y @modelcontextprotocol/server-filesystem <dir>` | No | High |
| **Document → markdown (PDF/DOCX/XLSX)** | MarkItDown MCP (Microsoft) | `uvx markitdown-mcp` | No | High |
| **Gmail / Drive / Calendar / Docs** | `taylorwilsdon/google_workspace_mcp` | `uvx workspace-mcp` | Your own Google Cloud OAuth creds (free) | Medium-high — MIT, active, but OAuth setup is real work |
| **Persistent memory / knowledge graph** | Official `memory` server (simplest) or **Basic Memory** (better) | `npx -y @modelcontextprotocol/server-memory` / `uv tool install basic-memory` | No | High — Basic Memory has 3.5k stars, active |
| **Up-to-date library docs** | Context7 | `npx -y @upstash/context7-mcp` | Optional (free key raises limits) | High |
| **Scheduled tasks / cron** | `PhialsBasement/scheduler-mcp` or `liao1fan/schedule-task-mcp` | Python | No | **Low-medium** — small projects, vet before shipping |
| **Voice / TTS** | Kokoro TTS MCP (several wrappers) | Python + Kokoro-82M weights | No | Medium — model is solid (Apache 2.0), wrappers are hobby-scale |
| **Video generation** | No good free MCP exists — use ComfyUI + WAN 2.2 / LTX-Video locally | — | No | Low — treat as a build, not an install |

---

## How Codex loads these

Codex reads MCP config from `~/.codex/config.toml` (and a project-scoped `.codex/config.toml` for **trusted** projects only — an untrusted project silently gets no MCP servers, which is a common gotcha). One TOML table per server; the transport is inferred from which key you set — `command` means stdio, `url` means streamable HTTP.

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest", "--headless", "--isolated"]
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.fetch]
command = "uvx"
args = ["mcp-server-fetch"]

[mcp_servers.memory]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-memory"]
env = { MEMORY_FILE_PATH = "/path/to/memory.jsonl" }
```

You can also add servers from the CLI (`codex mcp add <name> -- <command> <args...>`) and verify what actually loaded with `/mcp` inside a Codex session. If a server needs OAuth with a fixed callback port, set the top-level `mcp_oauth_callback_port`.

---

## 1. Image generation

This is the weakest category for "free and well-maintained," and the situation changed recently — the obvious answer from a year ago is now dead.

### The Pollinations caveat (read this first)

Pollinations.ai is still the best **keyless** image generator: you generate an image by constructing a URL, no signup, no key. But the anonymous tier is now watermarked and rate-capped at roughly one request per 15 seconds.

More importantly, **the popular MCP wrapper is gone**. `pinkpixel-dev/MCPollinations` (the one every listicle still recommends) is **archived** — its README states it no longer works with Pollinations' newer API. Its successor, `pinkpixel-dev/nectar-mcp` (`npx -y @pinkpixel/nectar-mcp`, Apache-2.0), **requires a Pollinations API key for all generation and video tools** (model listing is the only keyless tool), and it is very early-stage: 6 commits, 1 star, 0 forks. It is not something to depend on.

**Recommendation:** for a chat app, do not route Pollinations through MCP at all. It is a single HTTP GET returning an image — call it directly from your app code. MCP buys you nothing here and adds a fragile dependency plus base64 round-tripping through the model's context.

### Hugging Face official MCP server — the best supported free path

- **Repo:** https://github.com/huggingface/hf-mcp-server · **Endpoint:** https://huggingface.co/mcp
- **License:** MIT. Maintained by Hugging Face themselves.
- **Install:** remote HTTP (`https://huggingface.co/mcp` with `Authorization: Bearer <HF_TOKEN>`), or locally via `npx @llmindset/hf-mcp-server`, or Docker.
- **API key:** yes, but a **free** HF account token. Free-tier generation runs on ZeroGPU with a usage quota, so it is fine for a demo app and not for production volume.
- **Why it matters:** beyond the seven built-in Hub tools (`hub_repo_search`, `hf_fs`, etc.), you attach arbitrary **Gradio Spaces as tools** from https://huggingface.co/settings/mcp. That is the actual image-generation mechanism — point it at a FLUX Space and you have text-to-image. The same trick covers TTS, speech-to-text, and video Spaces, which is why this one server plausibly closes three gaps at once.
- Pass `?no_image_content=true` on the URL if you want to strip image blocks out of Gradio responses (useful when you would rather handle the file yourself than blow up the context window).

### mcp-hfspace — the lighter, older sibling

- **Repo:** https://github.com/evalstate/mcp-hfspace · MIT · 388 stars.
- **Install:** `npx -y @llmindset/mcp-hfspace black-forest-labs/FLUX.1-schnell` — you list the Spaces you want as positional args.
- **API key:** **optional.** Works anonymously against public Spaces; `--hf-token` only needed for private Spaces or dedicated hardware.
- Known-good Spaces from its docs: `black-forest-labs/FLUX.1-schnell` and `shuttleai/shuttle-3.1-aesthetic` (image), `parler-tts/parler_tts` (TTS), `hf-audio/whisper-large-v3-turbo` (STT).
- Returns images inline in tool responses; other files land in `--work-dir`.
- The author notes it is superseded by the official HF server, but it still works and it is the lowest-friction option if you want zero-token image generation today.

### ComfyUI MCP — fully local, fully free, real setup cost

Requires ComfyUI running locally plus at least one checkpoint. Zero API cost and no rate limits, but you need a GPU.

- `artokun/comfyui-mcp` — the most ambitious: 108 tools, 29 skills, covers Flux / WAN / LTX-2.3 / Qwen, can author and edit workflows in natural language, and ships a Claude Code plugin. Also the one most likely to overwhelm a small agent with tool count.
- `joenorton/comfyui-mcp-server` — lightweight Python server, workflow management + API client. Better starting point.
- `Peleke/comfyui-mcp` — generation, upscaling, ControlNet, inpainting/outpainting, IP-Adapter style transfer, and lip-synced talking-head video.
- `AvidGameFan/ImageMCP` — minimal, aimed at LM Studio.

---

## 2. Browser automation

### Playwright MCP — take this one

- **Repo:** https://github.com/microsoft/playwright-mcp · **npm:** `@playwright/mcp`
- **Install:** `npx @playwright/mcp@latest`
- **API key:** none. Runs a local browser.
- **Maturity: the strongest in this whole document** — 35.5k stars, 3k forks, 565 commits, maintained by Microsoft.
- Drives the browser through **accessibility-tree snapshots rather than screenshots**, so it works without a vision model — which matters because it keeps token cost sane and does not depend on Codex's image handling.
- 80+ tools spanning navigation, clicking, typing, form fill, drag/drop, file upload, tab management, network mocking, cookie/localStorage access, PDF generation, and trace/video recording.
- Flags worth knowing: `--headless` (it is **headed** by default — you almost certainly want this for a server-side app), `--isolated` (in-memory profile, nothing written to disk), `--user-data-dir` (persist logins), `--caps=vision` (enable coordinate-based interaction), `--extension` (attach to the user's existing Chrome).

### Chrome DevTools MCP — complementary, not a substitute

- Official, from Google's Chrome team; built on Puppeteer + the Chrome DevTools Protocol. ~29 tools.
- The useful framing: **Playwright drives the browser, Chrome DevTools debugs it.** Playwright tells you what happened from the user's perspective; DevTools MCP tells you why, from the browser's — network waterfalls, console, performance traces, Lighthouse audits.
- Chrome-only. If Firefox or WebKit ever matters, that is Playwright's job.
- For a ChatGPT-clone's "browse the web for me" feature, Playwright alone is the right call. Add DevTools MCP only if the agent needs to debug web apps.

---

## 3. Fetch and scrape

Codex has web *search*, but search results are not page contents. These fill the read-the-page half.

- **Official Fetch server** — `uvx mcp-server-fetch`. Part of `modelcontextprotocol/servers`, converts pages to markdown, supports chunked reads via `start_index`. No key. Note the repo explicitly frames its reference servers as educational demonstrations rather than production systems, so treat it as a solid default that you may outgrow.
- **DuckDuckGo MCP** (`nickclyde/duckduckgo-mcp-server`) — `uvx duckduckgo-mcp-server`. MIT, 1.4k stars. **No API key at all**, which makes it the best free search-plus-fetch combo. Two tools: search (with region and SafeSearch options) and page-content fetch with intelligent text extraction. Ships built-in rate limiting (30 searches/min, 20 fetches/min), optional curl backend with TLS impersonation for bot-detection bypass, and SSRF protections against private-URL requests. That last detail matters if you expose it to end users.
- **Crawl4AI-based MCPs** — for multi-page crawls, not single fetches. Self-hosted means no per-page charges and no rate limits. The ecosystem is fragmented; candidates: `sadiuysal/crawl4ai-mcp-server` (4 tools: scrape, crawl, crawl_site, crawl_sitemap), `walksoda/crawl-mcp` (17 tools, also handles PDFs, Office docs, YouTube), `luxiaolei/searxng-crawl4ai-mcp` (pairs Crawl4AI with self-hosted SearXNG search), `BjornMelin/crawl4ai-mcp-server`. **Pick one and pin the version** — none of these has decisive mindshare.
- **Firecrawl** — has a native MCP server and can be tried keyless, with 1,000 free credits/month after signup. Best output quality (clean markdown, ~67% token reduction claimed) but it is a commercial service and the self-hosted version is reportedly still not production-ready. Fine as a fallback, not as the foundation.

---

## 4. Filesystem and productivity

- **Filesystem** — `npx -y @modelcontextprotocol/server-filesystem /allowed/dir`. Official reference server, configurable access controls. Codex has its own file tools inside its sandbox, so the value here is specifically **scoped access to directories outside the sandbox** (a user's Documents folder, say).
- **Git** — `uvx mcp-server-git`. Read, search, and manipulate repos as structured tools rather than shelling out.
- **Time** — official reference server, time and timezone conversion. Trivial but genuinely fixes a real LLM failure mode.
- **MarkItDown MCP** (Microsoft) — `uvx markitdown-mcp`. Converts 29+ formats to markdown: PDF (via pdfminer), DOCX (via mammoth), PPTX, XLSX, images with OCR and EXIF, audio transcription, HTML/CSV/JSON/XML, and ZIP archives. This is the single highest-leverage "file upload" server for a chat app — it is how you make "drop a PDF in the chat" work.
- **Google Workspace MCP** (`taylorwilsdon/google_workspace_mcp`) — `uvx workspace-mcp`. MIT, actively maintained (OAuth improvements shipped May 2026), Python 3.11+. Covers Gmail, Drive, Calendar, Docs, Sheets, Slides, Chat, Forms, Tasks, Search. Supports stdio, HTTP, and SSE. **The catch:** you must create your own Google Cloud project with OAuth 2.0 credentials. Free, but a real afternoon of setup, plus a consent-screen verification story if you ever put this in front of users who are not you.

Note the archived servers: Brave Search, GitHub, Slack, and SQLite were moved out of `modelcontextprotocol/servers` into `servers-archived`. Do not copy install commands for those from old blog posts — use the vendor-maintained replacements (Brave's own server, Zencoder's Slack server, GitHub's official server).

---

## 5. Memory and knowledge graphs

- **Official Memory server** — `npx -y @modelcontextprotocol/server-memory`. Knowledge-graph memory persisted to a local JSONL file. The conservative pick: maintained alongside the protocol itself, no dependencies, no account. Also the least capable — no semantic search.
- **Basic Memory** (`basicmachines-co/basic-memory`) — `uv tool install basic-memory`. AGPL-3.0, 3.5k stars, 1,614 commits, very active (recent work: semantic vector search, FastMCP 3.0 support, CLI overhaul through v0.20). Stores memory as **plain Markdown files you own**, with a semantic knowledge graph layered on top and two-way sync. Local use needs no account; there is an optional $15/month cloud tier for cross-device sync that you can ignore. **This is the best free memory server** if you want something better than the reference implementation. Watch the AGPL if you plan to distribute the app.
- **Mem0 / OpenMemory** — semantic search, automatic memory extraction, entity linking, graph memory, 9 tools. Free tier plus local self-hosting via OpenMemory, but the good version is a managed cloud service. Reach for it only if you specifically need automatic memory extraction.
- **Sequential Thinking** — `npx -y @modelcontextprotocol/server-sequential-thinking`. Official. Not memory exactly, but a cheap structured-reasoning scratchpad, and free.

---

## 6. Other things ChatGPT has that Codex does not

**Up-to-date library docs — Context7** (`upstash/context7`). `npx -y @upstash/context7-mcp`. MIT, works without a key at basic rate limits; a free key from context7.com/dashboard raises them. Gives the agent version-specific library documentation instead of hallucinated APIs. High value for a coding-adjacent chat app, near-zero setup.

**Scheduled tasks.** No dominant server here; all candidates are small projects, so vet the code before running one with shell access. Options: `PhialsBasement/scheduler-mcp` (cron-scheduled shell commands, API calls, AI tasks, desktop notifications), `liao1fan/schedule-task-mcp` (interval / cron / one-shot date triggers, SQLite persistence, explicitly designed to turn "every morning at 9:30, send me a briefing" into a schedule), and a `cron-scheduler-mcp-server` with SQLite persistence, retry logic, and queryable logs (MIT). **Honestly assess build-vs-install here** — a scheduler that can run shell commands is a large attack surface for a hosted chat app, and cron plus your own job table may be the safer answer.

**Voice / TTS.** The model to use is **Kokoro-82M**: Apache 2.0, 54 voices across 8 languages, ~2–3 GB VRAM (CPU works), faster than real time, and widely considered the best default open-source TTS in 2026. The MCP wrappers are all hobby-scale, so pick on packaging: `ard1102/kokoro-tts-mcp-server` (Docker Hub deployment, 2-step setup), `mberg/kokoro-tts-mcp` (writes .mp3, optional S3 upload), `aparsoft/kokoro-mcp-server` (librosa audio enhancement, plus CLI and Python API). Alternatively, get TTS through `mcp-hfspace` pointed at a TTS Space and skip the extra dependency entirely.

**Video generation.** There is no credible free, maintained, general-purpose video MCP server as of July 2026. The open-weights models are excellent — WAN 2.2 / Wan 2.1 (Apache 2.0, Alibaba), LTX-2.3 (open weights, generates synchronized video and audio in one diffusion pass, free under the LTX Model License for companies under $10M revenue), HunyuanVideo — but the access path is ComfyUI locally or a Hugging Face Space, not a purpose-built MCP server. Nectar-MCP exposes `pollinations_generate_video` but needs a paid key and is immature. **Treat video as a build, not an install.**

**YouTube transcripts.** Several keyless options: `kimtaeyoon83/mcp-server-youtube-transcript` (npx, language selection, optional timestamps) and `jkawamoto/mcp-youtube-transcript`. Cheap capability, meaningful UX win.

---

## Recommendations for this project

If I had to ship a starting set today, in order:

1. **Playwright MCP** — the one unambiguous win. Mature, keyless, closes the biggest gap (browser/computer use), and the accessibility-tree approach keeps token cost down.
2. **DuckDuckGo MCP + official Fetch** — keyless page reading, together with Codex's native search.
3. **MarkItDown MCP** — makes file uploads actually useful.
4. **Basic Memory** — persistent memory that is inspectable Markdown rather than an opaque store.
5. **Context7** — cheap, high signal.
6. **mcp-hfspace or the official HF server** for image generation, with the expectation that free-tier quota will bite and you will eventually want a paid image API.

Two cautions worth carrying into implementation. First, **tool-count inflation is real** — `artokun/comfyui-mcp` alone exposes 108 tools and Playwright exposes 80+; loading everything at once will bloat every request's context and degrade tool selection. Enable servers per-conversation or per-mode rather than globally. Second, **several of these execute local code or shell commands** (schedulers, ComfyUI, filesystem). If the app is multi-tenant or internet-facing, those belong behind the same sandbox boundary Codex already uses for shell, not alongside it.

---

## Sources

- [modelcontextprotocol/servers — official reference servers](https://github.com/modelcontextprotocol/servers)
- [Reference Servers Overview — DeepWiki](https://deepwiki.com/modelcontextprotocol/servers/2-reference-servers-overview)
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP docs](https://playwright.dev/docs/getting-started-mcp)
- [@playwright/mcp on npm](https://www.npmjs.com/package/@playwright/mcp)
- [Chrome DevTools MCP vs Playwright MCP — MCP.Directory](https://mcp.directory/blog/chrome-devtools-mcp-vs-playwright-mcp-2026)
- [Playwright vs. Chrome DevTools MCP: Driving vs. Debugging — Steve Kinney](https://stevekinney.com/writing/driving-vs-debugging-the-browser)
- [huggingface/hf-mcp-server](https://github.com/huggingface/hf-mcp-server)
- [evalstate/mcp-hfspace](https://github.com/evalstate/mcp-hfspace)
- [pinkpixel-dev/MCPollinations (archived)](https://github.com/pinkpixel-dev/MCPollinations)
- [pinkpixel-dev/nectar-mcp](https://github.com/pinkpixel-dev/nectar-mcp)
- [pollinations/pollinations](https://github.com/pollinations/pollinations)
- [Pollinations AI API documentation](https://pollinations-ai.com/api)
- [artokun/comfyui-mcp](https://github.com/artokun/comfyui-mcp)
- [joenorton/comfyui-mcp-server](https://github.com/joenorton/comfyui-mcp-server)
- [Peleke/comfyui-mcp](https://github.com/Peleke/comfyui-mcp)
- [AvidGameFan/ImageMCP](https://github.com/AvidGameFan/ImageMCP)
- [nickclyde/duckduckgo-mcp-server](https://github.com/nickclyde/duckduckgo-mcp-server)
- [sadiuysal/crawl4ai-mcp-server](https://github.com/sadiuysal/crawl4ai-mcp-server)
- [walksoda/crawl-mcp](https://github.com/walksoda/crawl-mcp)
- [luxiaolei/searxng-crawl4ai-mcp](https://github.com/luxiaolei/searxng-crawl4ai-mcp)
- [Crawl4AI self-hosting guide](https://docs.crawl4ai.com/core/self-hosting/)
- [Best open-source web crawlers in 2026 — Firecrawl](https://www.firecrawl.dev/blog/best-open-source-web-crawler)
- [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp)
- [MarkItDown MCP — MCP.Directory guide](https://mcp.directory/blog/markitdown-mcp-complete-guide-2026)
- [Official MarkItDown MCP — PulseMCP](https://www.pulsemcp.com/servers/markitdown)
- [basicmachines-co/basic-memory](https://github.com/basicmachines-co/basic-memory)
- [Best Memory & Knowledge MCP Servers in 2026 — ChatForest](https://chatforest.com/guides/best-memory-mcp-servers/)
- [upstash/context7](https://github.com/upstash/context7)
- [@upstash/context7-mcp on npm](https://www.npmjs.com/package/@upstash/context7-mcp)
- [PhialsBasement/scheduler-mcp](https://github.com/PhialsBasement/scheduler-mcp)
- [liao1fan/schedule-task-mcp](https://github.com/liao1fan/schedule-task-mcp)
- [ard1102/kokoro-tts-mcp-server](https://github.com/ard1102/kokoro-tts-mcp-server)
- [mberg/kokoro-tts-mcp](https://github.com/mberg/kokoro-tts-mcp)
- [aparsoft/kokoro-mcp-server](https://github.com/aparsoft/kokoro-mcp-server)
- [Best Local TTS Models 2026 — Local AI Master](https://localaimaster.com/blog/best-local-tts-models)
- [kimtaeyoon83/mcp-server-youtube-transcript](https://github.com/kimtaeyoon83/mcp-server-youtube-transcript)
- [jkawamoto/mcp-youtube-transcript](https://github.com/jkawamoto/mcp-youtube-transcript)
- [Open Source Video Generation Models (2026 Landscape) — LTX](https://ltx.io/blog/open-source-video-generation-models-guide)
- [Local AI Video Generation: LTX-2, Wan 2.2 & HunyuanVideo](https://localaimaster.com/blog/local-ai-video-generation)
- [Codex MCP documentation — OpenAI](https://developers.openai.com/codex/mcp)
- [Codex config.toml guide](https://blog.laozhang.ai/en/posts/codex-config-toml)
- [How to set up MCPs with Codex CLI in 2026 — Composio](https://composio.dev/content/how-to-mcp-with-codex)
- [Codex issue #3441 — MCP servers not loading from config.toml](https://github.com/openai/codex/issues/3441)
