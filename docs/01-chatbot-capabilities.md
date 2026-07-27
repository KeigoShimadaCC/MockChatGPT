# Agentic capabilities of major AI chat apps (July 2026)

Research compiled from web sources on 2026-07-27. Covers: **ChatGPT** (OpenAI), **Claude** (Anthropic), **Gemini** (Google), **Copilot** (Microsoft), **Grok** (xAI), **Perplexity**, and the Chinese apps **DeepSeek**, **Kimi** (Moonshot), **Qwen Chat** (Alibaba), **Doubao** (ByteDance). Facts were verified against official pages where fetchable; several vendors block scrapers, so some details rely on cross-checked press coverage (flagged in the per-capability notes).

## Summary matrix

✅ = available · 🟡 = partial / gated / separate product · ❌ = not available

| Capability | ChatGPT | Claude | Gemini | Copilot | Grok | Perplexity | DeepSeek | Kimi | Qwen | Doubao |
|---|---|---|---|---|---|---|---|---|---|---|
| Web search + citations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deep research mode | ✅ | ✅ | ✅ | 🟡¹ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Image generation | ✅ | ❌² | ✅ | ✅ | ✅ (paid) | ✅ | ❌ | 🟡 | ✅ | ✅ |
| Vision (image understanding) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ |
| File upload / doc Q&A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Code interpreter (sandboxed) | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 | ❌ | ✅ | 🟡 | 🟡 |
| Coding agent (Codex/Claude Code style) | ✅ Codex | ✅ Claude Code | 🟡 Jules | ❌³ | ✅ Grok Build | 🟡 | ❌ | ✅ Kimi Code | ✅ Qwen Code | 🟡 Trae |
| Canvas / artifacts | 🟡⁴ | ✅ | ✅ | 🟡 | ✅ Studio | 🟡 Labs | ❌ | 🟡 | ✅ | ❌ |
| Persistent memory | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | ✅ | ✅ | 🟡 |
| Custom instructions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | 🟡⁵ | ❌⁵ |
| Voice mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 dictation | ✅ | ✅ | ✅ |
| Video generation | ❌⁶ | ❌ | ✅ Veo/Omni | ❌⁶ | ✅ | ❌ | ❌ | 🟡 | ✅ Wan | ✅ Seedance |
| Computer use / browser agent | ✅ Agent Mode | ✅ in Chrome | ✅ Gemini Agent | 🟡 | ❌ | ✅ Comet/Computer | ❌ | ✅ Kimi Work | 🟡 | 🟡 |
| Scheduled tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 🟡 | ❌ |
| Connectors / MCP / plugins | ✅ Apps | ✅ MCP | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | 🟡 |
| Projects / workspaces | ✅ | ✅ | 🟡 Gems/Notebook | 🟡 Pages | ✅ | ✅ Spaces | ❌ | ✅ | ❌ | ❌ |
| Data analysis + charts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ (paid) |
| Autonomous multi-step agent | ✅ | ✅ Cowork | ✅ | ✅ Cowork | 🟡 | ✅ | ❌ | ✅ OK Computer | ✅ | 🟡 |

¹ Consumer Deep Research retiring 2026-08-18, replaced by "Researcher" for M365 Premium. ² Deliberate: Claude renders SVG/React artifacts or uses MCP image tools. ³ GitHub Copilot excluded (separate product). ⁴ Canvas reportedly being folded into inline blocks for newest models. ⁵ China's "AI Anthropomorphic Interaction Services" regulation (effective 2026-07-15) forced Doubao and domestic Qwen to remove persona/custom-agent features. ⁶ **Sora is gone.** OpenAI announced on 2026-03-24 that it was discontinuing Sora; the app and web experience shut down 2026-04-26 and the API is scheduled to shut down 2026-09-24. ChatGPT therefore has no consumer video generation, and Copilot's planned Sora integration is moot.

---

## Capabilities in detail

### 1. Web search & live browsing
Real-time search with cited sources during chat. **All ten services** have it, free-tier included everywhere. Grok adds live X/Twitter data; Doubao integrates Toutiao/Douyin search; Perplexity is search-first by design.

### 2. Deep research mode
Multi-step autonomous research producing long, cited reports. **ChatGPT** (Deep Research, quota-tiered), **Claude** (Research), **Gemini** (Deep Research, free-tier limited), **Grok** (DeepSearch/DeeperSearch), **Perplexity** (Deep Research + Labs), **Kimi** (Deep Research, 10k+ word reports), **Qwen** (Deep Research, free), **Doubao** (DeepResearch with interleaved "think-while-searching"). **Copilot** is retiring consumer Deep Research (Aug 18, 2026). **DeepSeek** has no shipped equivalent.

### 3. Image generation
**ChatGPT** (native GPT-image, all tiers), **Gemini** (Nano Banana 2 / Nano Banana Pro — Imagen brand retired June 2026), **Copilot** (Imagine), **Grok** (Aurora/Imagine — paywalled since Apr 2026), **Perplexity** (model picker: Nano Banana 2, Seedream 4.5, GPT Image 2, FLUX), **Qwen** (Qwen-Image/VLo, free), **Doubao** (Seedream 5.0), **Kimi** (via plugin marketplace install). **Claude** deliberately doesn't (SVG/code artifacts instead); **DeepSeek**'s chat refuses image generation (Janus-Pro is open-weights only).

### 4. Vision / image understanding
Universal except **DeepSeek**, which was OCR-only until an "Image Recognition Mode" began gray-scale rollout in April 2026 (still partial). Kimi/Qwen/Doubao all do genuine multimodal understanding including video input (Kimi).

### 5. File upload & document understanding
Universal. Notable limits: Copilot 50MB/20 files; DeepSeek & Kimi 100MB/50 files; Claude uniform caps across tiers; ChatGPT tiered by plan.

### 6. Code interpreter / sandboxed execution
**ChatGPT** (Advanced Data Analysis), **Claude** (analysis/code-execution tool, no sandbox internet), **Gemini** (Python-only, matplotlib), **Grok** (Agent Tools API sandbox), **Kimi** (inside OK Computer agent). Partial: **Perplexity** (inside Labs/Computer only), **Copilot** (Excel/Copilot Studio contexts), **Qwen** (Qwen-Agent framework level), **Doubao** (desktop "AI Programming" feature). **DeepSeek**: none.

### 7. Coding agents
- **ChatGPT → Codex**: merged into mobile app (May 2026) and desktop app (July 2026), all plans. *This is what MockChatGPT builds on.*
- **Claude → Claude Code**: bundled with Pro/Max; Cowork generalizes it to non-coding work.
- **Grok → Grok Build** (CLI, 8 parallel sub-agents, MCP).
- **Kimi → Kimi Code**, **Qwen → Qwen Code** (open-source CLI, forked from Gemini CLI), **ByteDance → Trae** (separate IDE).
- **Gemini → Jules** (separate site, Pro/Ultra benefit). **Perplexity/DeepSeek/Copilot-consumer**: none first-party.

### 8. Canvas / artifacts
**Claude Artifacts** (multiplayer editing on higher tiers), **Gemini Canvas** (websites/apps/quizzes), **Grok Studio**, **Qwen Artifacts + Web Dev mode**. Partial: **ChatGPT Canvas** (being restructured into inline blocks), **Copilot Pages** (+ announced "Copilot Canvas"), **Perplexity Labs** outputs, **Kimi** (Slides/websites, single-user). None: DeepSeek, Doubao.

### 9. Persistent memory across chats
**ChatGPT** (two-layer, "Dreaming V3" background synthesis), **Claude** (free for all users since Mar 2026; search-past-chats is paid), **Gemini** (free tier included), **Copilot** ("Remember that…"), **Grok** (editable, not in EU/UK), **Kimi** (Memory Space), **Qwen** (Chat Memory). Partial: **Perplexity** (scoped to threads/Spaces, no unified global memory), **Doubao** (cross-device sync, no distinct memory system). None: **DeepSeek** (top-requested missing feature).

### 10. Custom instructions
Nearly universal (ChatGPT personality presets; Claude styles + project instructions; Gemini Saved Info + Gems; Grok Companions/personas). **DeepSeek** lacks it. **Doubao** shut down its persona-agent feature on 2026-07-15 under the new PRC anthropomorphic-AI regulation; domestic Qwen pulled similar features.

### 11. Voice mode
**ChatGPT** (GPT-Live-1, full-duplex), **Claude** (turn-based, tool-connected since July 2026), **Gemini Live** (camera/screen share), **Copilot Voice** (50+ languages), **Grok** (full-duplex, paid tiers), **Perplexity** (assistant apps + Comet voice), **Kimi** (real-time interruptible calls), **Qwen** (voice chat + TTS), **Doubao** (end-to-end speech model, arguably best-in-class latency/naturalness). **DeepSeek**: dictation input only.

### 12. Video generation
This row changed more than any other in the past year, and it moved *backwards* for OpenAI. **ChatGPT no longer generates video**: OpenAI announced on 2026-03-24 that it was discontinuing Sora, shut down the app and web experience on 2026-04-26, and has the API scheduled for 2026-09-24. OpenAI framed the wind-down as reallocating toward coding tools and enterprise, with the underlying research continuing as a "world models" effort rather than a consumer video app; reporting attributes the decision to roughly $1M/day operating costs against about $2.1M of lifetime in-app purchases and a user base that peaked near 1M and then fell by half. Any guide still listing Sora as a ChatGPT Plus/Pro perk is out of date, and OpenAI has announced no successor video product.

Still shipping: **Gemini** (Veo 3.1 via "Omni"/Flow credits, paid tiers), **Grok** (Imagine Video 1.5, GA 2026-06-16), **Qwen** (Wan 2.5+), **Doubao** (Seedance 2.0/2.5 in-app). Partial: **Kimi** (Creation Space in beta). None: ChatGPT, Claude, Copilot, Perplexity, DeepSeek.

### 13. Computer use / browser agent
**ChatGPT Agent Mode** (cloud VM with browser/terminal; plus the Atlas browser), **Claude in Chrome** (paid plans) , **Gemini Agent** (Ultra; successor to Project Mariner), **Perplexity Comet** (free since Mar 2026) + **Perplexity Computer** (Max), **Kimi Work** (desktop computer control). Partial: **Copilot Actions/Tasks** (rolling out), **Qwen** (GUI-capable model, not exposed as consumer feature), **Doubao** (UI-TARS is enterprise-facing). None: Grok (coding-only agent), DeepSeek.

### 14. Scheduled tasks / automations
**ChatGPT Tasks**, **Claude Routines/Cowork scheduled tasks**, **Gemini Scheduled Actions** (Pro/Ultra, max 10), **Copilot Tasks** (preview), **Grok Automations** (July 2026, incl. email triggers), **Perplexity Scheduled Tasks**, **Kimi Scheduled Tasks** (plan-scaled). Partial: **Qwen** (cron in Qwen Code CLI, not consumer UI). None: DeepSeek, Doubao.

### 15. Connectors / MCP / plugins
**ChatGPT Apps** (Apps SDK, MCP-based; plugin directory spans ChatGPT + Codex), **Claude** (MCP inventor; Connectors Directory, ~800+ integrations), **Gemini Connected Apps**, **Copilot Connectors** (+ Build 2026 marketplace), **Grok Connectors** (bring-your-own-MCP + Skills), **Perplexity** (app connectors + local MCP), **Kimi** (plugin marketplace, MCP in Kimi Code), **Qwen** (in-app MCP settings, desktop). Weak/none: **Doubao** (Coze path shut July 2026), **DeepSeek**.

### 16. Projects / workspaces
**ChatGPT Projects**, **Claude Projects**, **Grok Workspaces/Studio**, **Perplexity Spaces** (files + instructions + scheduled research), **Kimi Projects**, **Copilot Pages** (partial). **Gemini** splits this across Gems + Gemini Notebook (ex-NotebookLM). None found: DeepSeek, Qwen consumer chat, Doubao.

### 17. Data analysis with charts
Follows code-interpreter availability: strong in ChatGPT/Claude/Gemini/Grok/Kimi/Perplexity(Labs); Copilot leans on Excel; **Doubao gates data analysis behind its new paid tiers** (first-ever consumer tiers, June 24, 2026: ¥68/¥200/¥500 per month); DeepSeek/Qwen partial.

### 18. Autonomous multi-step agent modes
- **ChatGPT**: Agent Mode (Operator + Deep Research merged) and the newer **ChatGPT Work** (July 2026).
- **Claude**: **Cowork** — Claude-Code-style agent for general knowledge work, web+mobile since July 2026.
- **Gemini**: Gemini Agent. **Copilot**: Cowork + "AutoPilot"/Scout layer (consumer/enterprise app merger due Aug 2026).

> **Naming collision, not a typo:** Anthropic and Microsoft both ship an agent product called **Cowork**, and they are unrelated. *Claude Cowork* launched as a desktop app in Jan 2026 and reached web and mobile for Max subscribers on 2026-07-07. *Copilot Cowork* entered Microsoft's Frontier early-access program in late Mar 2026 and went generally available worldwide on 2026-06-16 as a credit-based paid service, with a Chat/Cowork toggle in the M365 Copilot app and model routing across GPT-5.5 and Anthropic models. Both names appear in the table above and both are correct.
- **Perplexity**: Labs + Computer (multi-model, long-running). **Kimi**: OK Computer (20+ tools, 200–300 sequential tool calls; "Agent Swarm" marketing claims parallel sub-agents).
- **Qwen**: Qwen3.7-Max built for 1,000+ sequential tool calls. **Grok**: research/coding agents but no generalized consumer agent. **Doubao**: paid "Professional Edition" office-task mode. **DeepSeek**: none shipped (an autonomous agent is reportedly planned for end-2026).

---

## Observations relevant to MockChatGPT

1. The **table-stakes set** every serious app now has: web search, file/doc understanding, vision, memory, custom instructions, some code execution. MockChatGPT covers all of these via the Codex SDK.
2. The **differentiators** are modality (voice, video) and hosted agent surfaces (computer use, canvas) — the hardest to replicate locally.
3. **Codex being merged into the ChatGPT consumer app** (2026) validates this project's premise: OpenAI itself now treats the coding agent as a general chat capability.
4. China-market apps are diverging under regulation (persona features removed July 2026) while leapfrogging on voice (Doubao) and autonomous agents (Kimi OK Computer).
5. **Video is the one capability a Western leader retreated from.** Sora's shutdown leaves ChatGPT and Copilot with no consumer video generation at exactly the moment Gemini, Grok, Qwen and Doubao all ship it. If MockChatGPT is mirroring ChatGPT's surface, video is now correctly *out* of scope rather than a missing feature.
6. **Every one of the ten now ships some autonomous agent mode.** "Agent" has replaced "chat" as the organising product metaphor across the whole field — the single clearest trend in this survey.

## Sources

Compiled from five parallel research passes (ChatGPT/Claude, Gemini/Copilot, Grok/Perplexity, DeepSeek/Kimi, Qwen/Doubao), followed by an independent verification pass that corrected the video-generation row (see below).

**Verification pass (2026-07-27).** Three claims were re-checked against primary sources before publication. The Sora entry was **wrong and has been corrected**: OpenAI's own help centre carries an article titled "What to know about the Sora discontinuation", and Wikipedia's Sora article cites OpenAI's 2026-03-24 announcement, quoting "The app was shut down on April 26, 2026 and the [API] is planned to be discontinued on September 24, 2026, marking the end of the Sora AI brand as a whole." Two claims that *looked* like errors were confirmed correct and left alone: **Copilot Cowork** is a genuine Microsoft product (M365 blog, GA 2026-06-16) despite the name collision with Anthropic's Cowork, and **Claude Cowork**'s web/mobile expansion is corroborated by TechCrunch (2026-07-07) and CNBC (2026-02-24). Verification URLs: https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation · https://en.wikipedia.org/wiki/Sora_(text-to-video_model) · https://www.microsoft.com/en-us/microsoft-365/blog/2026/06/16/copilot-cowork-is-now-generally-available/ · https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/copilot-cowork-a-new-way-of-getting-work-done/ · https://www.anthropic.com/product/claude-cowork · https://techcrunch.com/2026/07/07/the-coding-agent-wars-are-spilling-into-the-rest-of-the-office-claude-cowork/ · https://blogs.windows.com/msedgedev/2026/05/13/new-updates-to-edge-across-desktop-and-mobile/

 Key primary sources: claude.com/pricing & support.claude.com, platform.claude.com docs, openai.com index posts (Deep Research, Operator, Codex app, Apps in ChatGPT), gemini.google/release-notes & subscriptions, blog.google, support.google.com/gemini, microsoft.com Copilot features & support.microsoft.com, x.ai/news, kimi.com/help (capability, memory-space, scheduled-tasks, membership), api-docs.deepseek.com, chat.qwen.ai, qwenlm.github.io/qwen-code-docs, seed.bytedance.com, perplexity.ai/help-center & changelog. Cross-checked with TechCrunch, VentureBeat, Washington Post, Tom's Hardware, 9to5Google/9to5Mac, TechNode, Pandaily, Scientific American, and others. Vendor pages that blocked fetching (openai.com pricing, x.ai, grok.com, perplexity.ai hub) were triangulated from multiple independent secondary sources; low-confidence items are flagged inline in the text.
