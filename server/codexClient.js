import fs from "fs";
import path from "path";
import { Codex } from "@openai/codex-sdk";
import { WORKSPACE, GENERATED_DIR, readSettings } from "./store.js";

const codex = new Codex();

function threadOptions() {
  const settings = readSettings();
  const opts = {
    workingDirectory: WORKSPACE,
    skipGitRepoCheck: true,
    sandboxMode: "workspace-write",
    networkAccessEnabled: true,
    webSearchEnabled: true,
  };
  if (settings.model?.trim()) opts.model = settings.model.trim();
  if (settings.reasoningEffort?.trim()) opts.modelReasoningEffort = settings.reasoningEffort.trim();
  return opts;
}

export function getThread(threadId) {
  const opts = threadOptions();
  return threadId ? codex.resumeThread(threadId, opts) : codex.startThread(opts);
}

// Runs one turn and forwards simplified events to `emit(event)`.
// Returns { threadId, finalText }.
export async function runTurn(thread, input, emit) {
  const { events } = await thread.runStreamed(input);
  // Codex can emit several agent_message items per turn (progress notes + final
  // answer); accumulate them so earlier ones aren't overwritten.
  const parts = [];
  let partial = "";
  let finalText = "";

  for await (const event of events) {
    switch (event.type) {
      case "item.started":
      case "item.updated":
      case "item.completed": {
        const item = event.item;
        const done = event.type === "item.completed";
        const id = item.id || null;
        switch (item.type) {
          case "agent_message":
            if (item.text) {
              if (done) {
                parts.push(item.text);
                partial = "";
              } else {
                partial = item.text;
              }
              finalText = parts.concat(partial ? [partial] : []).join("\n\n");
              emit({ type: done ? "assistant" : "assistant_delta", text: finalText });
            }
            break;
          case "reasoning": {
            // exec events expose reasoning as `text`; app-server protocol uses
            // summary/content arrays — handle whichever shape arrives.
            const text =
              item.text ||
              (Array.isArray(item.summary) ? item.summary.join("\n") : "") ||
              (Array.isArray(item.content) ? item.content.join("\n") : "");
            emit({ type: "activity", id, kind: "reasoning", label: "Thinking", detail: text, done });
            break;
          }
          case "command_execution":
            emit({
              type: "activity",
              id,
              kind: "command",
              label: done ? "Ran command" : "Running command",
              detail: item.command,
              output: done ? truncate(item.aggregated_output, 4000) : undefined,
              exitCode: item.exit_code,
              done,
            });
            break;
          case "web_search":
            emit({
              type: "activity",
              id,
              kind: "search",
              label: done ? "Searched the web" : "Searching the web",
              detail: item.query,
              done,
            });
            break;
          case "file_change":
            emit({
              type: "activity",
              id,
              kind: "file",
              label: done ? "Edited files" : "Editing files",
              detail: (item.changes || []).map((c) => c.path).join(", "),
              done,
            });
            break;
          case "mcp_tool_call": {
            // A screenshot only ever shows up on the completed item.
            const imageUrl = done ? saveResultImage(item) : null;
            // Browser servers announce themselves by name; generic backends (the
            // node_repl browser-use bridge) only give themselves away by handing
            // back a screenshot.
            const named = BROWSER_RE.test(item.server || "") || BROWSER_RE.test(item.tool || "");
            const url = extractUrl(item.arguments);
            const ev = {
              type: "activity",
              id,
              kind: named || imageUrl ? "browse" : "tool",
              label: named
                ? `Browsing: ${prettyToolName(item.tool)}`
                : imageUrl
                  ? "Browsing"
                  : `Using ${item.server}`,
              detail: url || item.tool,
              done,
            };
            if (imageUrl) ev.imageUrl = imageUrl;
            emit(ev);
            break;
          }
          case "todo_list":
            emit({
              type: "activity",
              id,
              kind: "plan",
              label: "Planning",
              detail: (item.items || [])
                .map((t) => `${t.completed ? "☑" : "☐"} ${t.text}`)
                .join("\n"),
              done,
            });
            break;
          case "error":
            emit({ type: "activity", id, kind: "error", label: "Error", detail: item.message, done: true });
            break;
        }
        break;
      }
      case "turn.completed":
        emit({ type: "usage", usage: event.usage });
        break;
      case "turn.failed":
        emit({ type: "error", message: event.error?.message || "The turn failed." });
        break;
      case "error":
        emit({ type: "error", message: event.message || "Unknown error" });
        break;
    }
  }

  return { threadId: thread.id, finalText };
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "\n… (truncated)" : s;
}

// MCP servers/tools that drive a browser; their calls render as "Browsing: …".
const BROWSER_RE = /playwright|browser|chrome|puppeteer/i;

// Pulls the page being visited out of a tool's arguments: browser servers pass a
// dedicated `url`, script-style backends bury it in the code they run.
// `arguments` is typed `unknown` — usually an object, sometimes a JSON string.
function extractUrl(raw) {
  const args = typeof raw === "string" ? tryParse(raw) ?? raw : raw;
  if (args && typeof args === "object" && typeof args.url === "string") return args.url;
  const serialized = typeof args === "string" ? args : safeStringify(args);
  return /https?:\/\/[^\s"'`\\)]+/.exec(serialized || "")?.[0] || null;
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

function prettyToolName(tool) {
  return String(tool || "tool")
    .replace(/^browser_/, "")
    .replace(/_/g, " ");
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;
// Playwright MCP reports a saved screenshot as a markdown link, e.g.
// "- [Screenshot of full page](./example-com.png)".
const IMAGE_LINK_RE = /\]\(([^)\s]+\.(?:png|jpe?g|webp|gif))\)/gi;

function generatedUrl(filename) {
  return `/files/generated/${encodeURIComponent(filename)}`;
}

function uniqueName(ext) {
  return `browse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// Screenshot results arrive in one of two shapes depending on the MCP server and
// how the tool was called: an inline base64 image block, or text pointing at a
// file the server wrote into the working directory. Handle both, and always land
// a copy under generated/ so replayed timelines keep working after the agent
// overwrites or removes the original.
function saveResultImage(item) {
  const blocks = item.result?.content;
  if (!Array.isArray(blocks)) return null;

  for (const block of blocks) {
    if (block?.type === "image" && typeof block.data === "string" && block.data) {
      const ext = /^image\/([a-z0-9]+)/i.exec(block.mimeType || "")?.[1] || "png";
      const name = uniqueName(ext);
      try {
        fs.writeFileSync(path.join(GENERATED_DIR, name), Buffer.from(block.data, "base64"));
        return generatedUrl(name);
      } catch (err) {
        console.error("could not save tool screenshot:", err?.message || err);
        return null;
      }
    }
  }

  for (const block of blocks) {
    if (block?.type !== "text" || typeof block.text !== "string") continue;
    for (const [, rel] of block.text.matchAll(IMAGE_LINK_RE)) {
      const url = copyWorkspaceImage(rel);
      if (url) return url;
    }
  }
  return null;
}

// Copies a workspace-relative image the tool just wrote into generated/, refusing
// anything that resolves outside the workspace (the path comes from tool output).
function copyWorkspaceImage(rel) {
  const src = path.resolve(WORKSPACE, rel.replace(/^\.\//, ""));
  const inWorkspace = src === WORKSPACE || src.startsWith(WORKSPACE + path.sep);
  if (!inWorkspace || !IMAGE_EXT_RE.test(src)) return null;
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return null;
  // Already where we want it — reference in place rather than duplicating.
  if (path.dirname(src) === GENERATED_DIR) return generatedUrl(path.basename(src));
  const name = uniqueName(path.extname(src).slice(1).toLowerCase() || "png");
  try {
    fs.copyFileSync(src, path.join(GENERATED_DIR, name));
    return generatedUrl(name);
  } catch (err) {
    console.error("could not copy tool screenshot:", err?.message || err);
    return null;
  }
}
