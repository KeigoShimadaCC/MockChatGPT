import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  ROOT,
  WORKSPACE,
  UPLOADS_DIR,
  listConversations,
  getConversation,
  saveConversation,
  createConversation,
  deleteConversation,
  readMemory,
  writeMemory,
  readSettings,
  writeSettings,
} from "./store.js";
import { buildPreamble } from "./prompts.js";
import { getThread, runTurn } from "./codexClient.js";

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

// ---------- conversations ----------
app.get("/api/conversations", (req, res) => res.json(listConversations()));
app.post("/api/conversations", (req, res) => res.json(createConversation()));
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
  const { text = "", attachments = [] } = req.body || {};
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
  if (isFirstTurn) promptText += buildPreamble() + "\n\n";
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
      const existing = ev.id && activities.find((a) => a.id === ev.id && a.kind === ev.kind);
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
});
