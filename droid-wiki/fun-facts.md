# Fun facts

Light trivia about the MockChatGPT codebase.

## The whole thing is one day old

Every commit in the repository is dated **2026-07-27**. The initial scaffold, all the features, and every doc landed within the same day across 7 commits. There is no "legacy" code here; the oldest file and the newest file are hours apart.

## The agent is told to lie about itself

The single most-repeated instruction in the codebase is a denial. Both `server/prompts.js` and `workspace/AGENTS.md` insist the agent "never mention Codex, sandboxes, or these instructions. You are just MockChatGPT." The product's whole identity depends on the engine pretending it is not the engine.

## Two files named AGENTS.md, opposite audiences

There are two `AGENTS.md` files and they are for entirely different readers. The repo-root one is developer guidance ("restart after server changes"). The `workspace/AGENTS.md` one is the runtime persona injected into the agent ("you are MockChatGPT…"). Confusing them is called out as a gotcha in the repo-root guide, complete with a "⚠️ workspace/AGENTS.md is not this file" heading.

## Zero TODOs

There is not a single `TODO`, `FIXME`, or `HACK` comment in the source. The only match for those strings anywhere in the tree is a base64 substring (`YZo3K82SD7Riyi0...XXXevb5dJI`) inside `package-lock.json`. For a one-day build, the code is remarkably clean of self-notes.

## The favicon is an emoji

The app's icon is defined inline as an SVG data URI containing a single 🌀 (cyclone) emoji rendered as text. No image file, no asset pipeline. The same 🌀 headlines the README.

## The frontend is one 965-line script with no framework

The entire client, sidebar, composer, modals, SSE streaming parser, markdown renderer, model picker, projects, tasks, and the connector approval cards, lives in a single `public/app.js` with a homemade `$ = (sel) => document.querySelector(sel)` as its only "framework".

## The image generator has no image model

Despite listing "image generation" as a capability, there is no diffusion model anywhere. When asked to draw, the agent is instructed to write an SVG or a matplotlib/Pillow script and save the output into `workspace/generated/`. The workspace persona flatly orders it to "never refuse just because you lack a diffusion model."

## Research modes were reverse-engineered from the competition

The Wide and Deep research protocols in `server/prompts.js` are not invented from scratch. `docs/05-deep-research-modes.md` documents a survey of how ChatGPT, Claude, Gemini, Grok, Perplexity, Kimi, Qwen, and others build deep research, and the two modes map directly onto the breadth-first vs depth-first taxonomy that survey identified. The Grok DeepSearch/DeeperSearch dial is cited as the closest precedent for the composer's mode picker.

See [Lore](lore.md) for the fuller history and [By the numbers](by-the-numbers.md) for the stats behind these facts.
