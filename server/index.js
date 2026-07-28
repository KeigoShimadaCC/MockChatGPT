import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  ROOT,
  WORKSPACE,
  UPLOADS_DIR,
  PROJECT_FILES_DIR,
  listConversations,
  getConversation,
  saveConversation,
  createConversation,
  branchConversation,
  deleteConversation,
  readMemory,
  writeMemory,
  readSettings,
  writeSettings,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
} from "./store.js";
import { buildPreamble, branchSeed, researchProtocol, memoryOptimizePrompt, MEMORY_TASK_MARKER } from "./prompts.js";
import { getThread, runTurn } from "./codexClient.js";
import { runHeavyResearch } from "./heavyResearch.js";
import { listServers, installServer, removeServer } from "./mcp.js";
import { logUsage, usageSummary, activityFeed } from "./usage.js";
import { listTasks, createTask, updateTask, deleteTask, runTask, startScheduler } from "./scheduler.js";
import { listSkills, readSkill, writeSkill, deleteSkill, ensureIndex } from "./skills.js";

const app = express();
const PORT = process.env.PORT || 3939;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(ROOT, "public")));
// Files codex generates (images, docs) and uploads, referenced as /files/... in messages
app.use("/files", express.static(WORKSPACE));
// Vendored client libs
app.use("/vendor/marked.js", (req, res) =>
  res.sendFile(path.join(ROOT, "node_modules/marked/marked.min.js")));
app.use("/vendor/purify.js", (req, res) =>
  res.sendFile(path.join(ROOT, "node_modules/dompurify/dist/purify.min.js")));
app.use("/vendor/hljs", express.static(path.join(ROOT, "node_modules/@highlightjs/cdn-assets")));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-() ]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---------- projects ----------
app.get("/api/projects", (req, res) => res.json(listProjects()));
app.post("/api/projects", (req, res) => {
  try {
    res.json(createProject(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch("/api/projects/:id", (req, res) => {
  try {
    res.json(updateProject(req.params.id, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete("/api/projects/:id", (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

// ---------- scheduled tasks ----------
app.get("/api/tasks", (req, res) => res.json(listTasks()));
app.post("/api/tasks", (req, res) => {
  try {
    res.json(createTask(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch("/api/tasks/:id", (req, res) => {
  try {
    res.json(updateTask(req.params.id, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete("/api/tasks/:id", (req, res) => {
  deleteTask(req.params.id);
  res.json({ ok: true });
});
app.post("/api/tasks/:id/run", (req, res) => {
  runTask(req.params.id)
    .then(() => console.log("[tasks] manual run finished"))
    .catch((e) => console.error("[tasks]", e));
  res.json({ ok: true, started: true });
});

// ---------- MCP connectors ----------
app.get("/api/mcp", async (req, res) => {
  try {
    res.json(await listServers());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/mcp/install", async (req, res) => {
  try {
    res.json(await installServer(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete("/api/mcp/:name", async (req, res) => {
  try {
    res.json(await removeServer(req.params.name));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- skills (agent-authored playbooks) ----------
app.get("/api/skills", (req, res) => res.json(listSkills()));
app.get("/api/skills/:slug", (req, res) => {
  try {
    const content = readSkill(req.params.slug);
    if (content === null) return res.status(404).json({ error: "not found" });
    res.json({ slug: req.params.slug, content });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.put("/api/skills/:slug", (req, res) => {
  try {
    res.json(writeSkill(req.params.slug, req.body?.content));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete("/api/skills/:slug", (req, res) => {
  try {
    deleteSkill(req.params.slug);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- usage & activity ----------
app.get("/api/usage", (req, res) => res.json(usageSummary(Number(req.query.days) || 30)));
app.get("/api/activity", (req, res) => res.json(activityFeed(Number(req.query.days) || 7)));

// ---------- conversations ----------
app.get("/api/conversations", (req, res) => res.json(listConversations()));
app.post("/api/conversations", (req, res) => res.json(createConversation(req.body?.projectId || null)));
app.get("/api/conversations/:id", (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(c);
});
app.patch("/api/conversations/:id", (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  if (typeof req.body.title === "string" && req.body.title.trim()) c.title = req.body.title.trim().slice(0, 100);
  res.json(saveConversation(c));
});
app.delete("/api/conversations/:id", (req, res) => {
  deleteConversation(req.params.id);
  res.json({ ok: true });
});
// Fork a conversation at a message: the child copies messages[0..messageIndex]
// and gets its own (initially absent) codex thread.
app.post("/api/conversations/:id/branch", (req, res) => {
  try {
    res.json(branchConversation(req.params.id, req.body || {}));
  } catch (e) {
    res.status(e.message === "conversation not found" ? 404 : 400).json({ error: e.message });
  }
});

// ---------- uploads ----------
const projectUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(PROJECT_FILES_DIR, req.params.id.replace(/[^\w-]/g, ""));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname.replace(/[^\w.\-() ]/g, "_")),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});
app.post("/api/projects/:id/files", projectUpload.array("files", 16), (req, res) => {
  res.json({ files: (req.files || []).map((f) => f.originalname) });
});
app.get("/api/projects/:id/files", (req, res) => {
  const dir = path.join(PROJECT_FILES_DIR, req.params.id.replace(/[^\w-]/g, ""));
  try {
    res.json({ files: fs.readdirSync(dir) });
  } catch {
    res.json({ files: [] });
  }
});

app.post("/api/upload", upload.array("files", 8), (req, res) => {
  res.json({
    files: (req.files || []).map((f) => ({
      name: f.originalname,
      path: f.path,
      relPath: path.relative(WORKSPACE, f.path),
      url: "/files/" + path.relative(WORKSPACE, f.path).split(path.sep).join("/"),
      mime: f.mimetype,
      isImage: f.mimetype.startsWith("image/"),
    })),
  });
});

// ---------- memory & settings ----------
app.get("/api/memory", (req, res) => res.json({ memory: readMemory() }));
app.put("/api/memory", (req, res) => {
  writeMemory(String(req.body.memory ?? ""));
  res.json({ ok: true });
});
// "Memory dreaming": a one-off Codex turn on a fresh thread that rewrites
// memory.md in place. GET hands the UI the same prompt + marker so it can build
// the weekly version of this as a scheduled task.
app.get("/api/memory/optimize", (req, res) =>
  res.json({ marker: MEMORY_TASK_MARKER, prompt: memoryOptimizePrompt() }));
app.post("/api/memory/optimize", async (req, res) => {
  const before = readMemory();
  if (!before.trim()) return res.json({ summary: "Nothing to optimize — memory is empty.", memory: before });
  try {
    const { finalText } = await runTurn(getThread(null), memoryOptimizePrompt(), () => {});
    const summary = finalText.trim().split("\n").filter((l) => l.trim()).pop();
    res.json({ summary: summary || "Memory rewritten.", memory: readMemory() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});
app.get("/api/settings", (req, res) => res.json(readSettings()));
app.put("/api/settings", (req, res) => {
  const cur = readSettings();
  writeSettings({ ...cur, ...req.body });
  res.json(readSettings());
});

// ---------- chat (SSE) ----------

// In-flight codex turns keyed by conversation id, so /stop can cancel one.
const activeRuns = new Map();

const REGENERATE_PROMPT =
  "Your previous answer wasn't quite right — answer my previous message again, better.";
const revisePrompt = (text) =>
  `I'm revising my previous message to: ${text}\n\nPlease answer the revised version.`;

// Kills the codex child process running this conversation's turn. The turn's
// own request then saves the partial answer and closes its SSE stream.
app.post("/api/conversations/:id/stop", (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: "no active run" });
  run.stopped = true;
  run.controller.abort();
  console.log(`[stop] aborted turn for conversation ${req.params.id}`);
  res.json({ ok: true, stopped: true });
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  const conv = getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: "not found" });
  if (activeRuns.has(conv.id)) return res.status(409).json({ error: "a turn is already running" });
  const { text = "", attachments = [], researchMode = "", replaceLast = "", approvedPlan = [] } = req.body || {};

  // replaceLast rewrites the tail of the transcript instead of appending to it:
  // "assistant" regenerates the last answer, "both" resends an edited question.
  // Codex threads are stateful and can't be forked, so the thread just gets an
  // extra instruction turn while the stored transcript keeps only one answer.
  const last = conv.messages.at(-1);
  const prev = conv.messages.at(-2);
  if (replaceLast && replaceLast !== "assistant" && replaceLast !== "both") {
    return res.status(400).json({ error: "replaceLast must be 'assistant' or 'both'" });
  }
  if (replaceLast && last?.role !== "assistant") {
    return res.status(400).json({ error: "nothing to replace" });
  }
  if (replaceLast === "both" && prev?.role !== "user") {
    return res.status(400).json({ error: "no user message to revise" });
  }
  if (replaceLast === "assistant") {
    if (text.trim()) return res.status(400).json({ error: "regenerate takes no text" });
  } else if (!text.trim() && attachments.length === 0) {
    return res.status(400).json({ error: "empty message" });
  }

  // A branch starts on a fresh Codex thread, which knows nothing of the
  // transcript it inherited, so that transcript is replayed into its first
  // turn. Snapshot it here: the block below rewrites conv.messages, and an
  // edit/regenerate as the branch's very first action would otherwise leave a
  // truncated (or doubled) replay.
  const seedNow = !conv.threadId && !!conv.seedPending;
  const seedMessages = seedNow
    ? conv.messages.slice(0, Number.isInteger(conv.forkOfIndex) ? conv.forkOfIndex + 1 : conv.messages.length)
    : [];

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  // drop the messages being replaced, then record the user message
  if (replaceLast) conv.messages.pop();
  const replacedUser = replaceLast === "both" ? conv.messages.pop() : null;
  if (replaceLast !== "assistant") {
    conv.messages.push({
      role: "user",
      text,
      // an edited question keeps its original attachments: the thread already
      // saw those files, so they are for display only and aren't re-sent
      attachments: replacedUser
        ? replacedUser.attachments || []
        : attachments.map((a) => ({ name: a.name, url: a.url, isImage: a.isImage })),
      ts: Date.now(),
    });
  }
  if (conv.title === "New chat" && text.trim()) {
    conv.title = text.trim().replace(/\s+/g, " ").slice(0, 48) + (text.trim().length > 48 ? "…" : "");
    send({ type: "title", title: conv.title });
  }
  saveConversation(conv);

  // build codex input
  const isFirstTurn = !conv.threadId;
  let promptText = "";
  if (isFirstTurn) promptText += buildPreamble(conv.projectId) + "\n\n";
  if (seedMessages.length) promptText += branchSeed(seedMessages) + "\n\n";
  promptText += researchProtocol(researchMode, approvedPlan);
  const nonImageFiles = attachments.filter((a) => !a.isImage);
  if (nonImageFiles.length) {
    promptText += `[The user attached files, available in your workspace: ${nonImageFiles
      .map((a) => a.relPath)
      .join(", ")}]\n`;
  }
  const imageFiles = attachments.filter((a) => a.isImage);
  if (imageFiles.length) {
    promptText += `[The user attached ${imageFiles.length} image(s), provided below]\n`;
  }
  promptText +=
    replaceLast === "assistant" ? REGENERATE_PROMPT : replaceLast === "both" ? revisePrompt(text) : text;

  const input =
    imageFiles.length > 0
      ? [
          { type: "text", text: promptText },
          ...imageFiles.map((a) => ({ type: "local_image", path: path.join(WORKSPACE, a.relPath) })),
        ]
      : promptText;

  // capture the agent's activity timeline so it can be replayed when the
  // conversation is reopened (ChatGPT-style "thinking" expander)
  const activities = [];
  let turnUsage = null;
  const startedAt = Date.now();
  const sendAndRecord = (ev) => {
    if (ev.type === "activity") {
      // Match on id alone: item ids are unique per turn, and an item's kind can
      // change once it completes (a tool call turns out to have been browsing).
      const existing = ev.id && activities.find((a) => a.id === ev.id);
      if (existing) Object.assign(existing, ev);
      else activities.push({ ...ev });
    }
    if (ev.type === "usage" && ev.usage) {
      // heavy mode emits one usage event per worker/phase — accumulate
      turnUsage = turnUsage || {};
      for (const [k, v] of Object.entries(ev.usage)) {
        if (typeof v === "number") turnUsage[k] = (turnUsage[k] || 0) + v;
      }
    }
    send(ev);
  };

  const run = { controller: new AbortController(), stopped: false };
  activeRuns.set(conv.id, run);
  // optional per-turn time budget (settings.maxTurnMinutes, 0/absent = off)
  const maxMin = Number(readSettings().maxTurnMinutes) || 0;
  const budgetTimer = maxMin
    ? setTimeout(() => {
        run.stopped = true;
        run.controller.abort();
        send({ type: "activity", kind: "error", label: "Time budget hit", detail: `Turn stopped after ${maxMin} min (set in Settings).`, done: true });
      }, maxMin * 60000)
    : null;
  try {
    const thread = getThread(conv.threadId);
    const { threadId, finalText, aborted } =
      /^heavy(-exec)?$/.test(researchMode)
        ? await runHeavyResearch(thread, input, sendAndRecord, text)
        : await runTurn(thread, input, sendAndRecord, run.controller.signal);
    const stopped = aborted || run.stopped;
    const answer = stopped ? (finalText ? `${finalText}

_(stopped)_` : "_(stopped)_") : finalText;
    conv.threadId = threadId || conv.threadId;
    if (seedNow && conv.threadId) conv.seedPending = false;
    conv.messages.push({
      role: "assistant",
      text: answer,
      activities,
      durationMs: Date.now() - startedAt,
      ...(turnUsage ? { usage: turnUsage } : {}),
      ...(stopped ? { stopped: true } : {}),
      ts: Date.now(),
    });
    saveConversation(conv);
    if (turnUsage) {
      logUsage({
        ts: Date.now(),
        conversationId: conv.id,
        model: readSettings().model?.trim() || "default",
        researchMode: researchMode || "",
        durationMs: Date.now() - startedAt,
        ...turnUsage,
      });
    }
    if (stopped) send({ type: "stopped", text: answer });
    send({ type: "done", threadId: conv.threadId });
  } catch (err) {
    console.error(err);
    send({ type: "error", message: String(err?.message || err) });
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer);
    activeRuns.delete(conv.id);
    clearInterval(heartbeat);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`MockChatGPT running → http://localhost:${PORT}`);
  if (!fs.existsSync(path.join(WORKSPACE, "AGENTS.md"))) {
    console.warn("note: workspace/AGENTS.md missing");
  }
  ensureIndex();
  startScheduler();
});
