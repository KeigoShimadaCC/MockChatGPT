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
import { buildPreamble, researchProtocol } from "./prompts.js";
import { getThread, runTurn } from "./codexClient.js";
import { listServers, installServer, removeServer } from "./mcp.js";
import { listTasks, createTask, updateTask, deleteTask, runTask, startScheduler } from "./scheduler.js";

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
app.get("/api/settings", (req, res) => res.json(readSettings()));
app.put("/api/settings", (req, res) => {
  const cur = readSettings();
  writeSettings({ ...cur, ...req.body });
  res.json(readSettings());
});

// ---------- chat (SSE) ----------
app.post("/api/conversations/:id/messages", async (req, res) => {
  const conv = getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: "not found" });
  const { text = "", attachments = [], researchMode = "" } = req.body || {};
  if (!text.trim() && attachments.length === 0) return res.status(400).json({ error: "empty message" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  // record user message
  conv.messages.push({
    role: "user",
    text,
    attachments: attachments.map((a) => ({ name: a.name, url: a.url, isImage: a.isImage })),
    ts: Date.now(),
  });
  if (conv.title === "New chat" && text.trim()) {
    conv.title = text.trim().replace(/\s+/g, " ").slice(0, 48) + (text.trim().length > 48 ? "…" : "");
    send({ type: "title", title: conv.title });
  }
  saveConversation(conv);

  // build codex input
  const isFirstTurn = !conv.threadId;
  let promptText = "";
  if (isFirstTurn) promptText += buildPreamble(conv.projectId) + "\n\n";
  promptText += researchProtocol(researchMode);
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
  promptText += text;

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
  const startedAt = Date.now();
  const sendAndRecord = (ev) => {
    if (ev.type === "activity") {
      // Match on id alone: item ids are unique per turn, and an item's kind can
      // change once it completes (a tool call turns out to have been browsing).
      const existing = ev.id && activities.find((a) => a.id === ev.id);
      if (existing) Object.assign(existing, ev);
      else activities.push({ ...ev });
    }
    send(ev);
  };

  try {
    const thread = getThread(conv.threadId);
    const { threadId, finalText } = await runTurn(thread, input, sendAndRecord);
    conv.threadId = threadId || conv.threadId;
    conv.messages.push({
      role: "assistant",
      text: finalText,
      activities,
      durationMs: Date.now() - startedAt,
      ts: Date.now(),
    });
    saveConversation(conv);
    send({ type: "done", threadId: conv.threadId });
  } catch (err) {
    console.error(err);
    send({ type: "error", message: String(err?.message || err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`MockChatGPT running → http://localhost:${PORT}`);
  if (!fs.existsSync(path.join(WORKSPACE, "AGENTS.md"))) {
    console.warn("note: workspace/AGENTS.md missing");
  }
  startScheduler();
});
