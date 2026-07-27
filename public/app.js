/* MockChatGPT frontend */
"use strict";

const $ = (sel) => document.querySelector(sel);
const app = $("#app");
const messagesEl = $("#messages");
const chatScroll = $("#chat-scroll");
const convListEl = $("#conv-list");
const promptInput = $("#prompt-input");
const sendBtn = $("#send-btn");
const sendIcon = $("#send-icon");
const stopIcon = $("#stop-icon");
const fileInput = $("#file-input");
const attachPreviews = $("#attach-previews");
const searchInput = $("#search-input");

let conversations = [];
let currentConv = null; // full conversation object
let pendingAttachments = [];
let streaming = false;
let streamAbort = null;

marked.setOptions({ breaks: true, gfm: true });

// `opts.planLive` is false for research-plan blocks in older messages — their
// card renders read-only instead of offering a Start button that would run
// research on top of a conversation that has already moved on.
function renderMarkdown(md, opts = {}) {
  const html = DOMPurify.sanitize(marked.parse(md || ""));
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  // dress up code blocks like ChatGPT
  tpl.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "";
    if (lang === "mcp-install") {
      const card = buildMcpInstallCard(code.textContent);
      if (card) {
        pre.replaceWith(card);
        return;
      }
    }
    if (lang === "research-plan") {
      const card = buildResearchPlanCard(code.textContent, opts.planLive !== false);
      if (card) {
        pre.replaceWith(card);
        return;
      }
    }
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    const header = document.createElement("div");
    header.className = "code-header";
    const label = document.createElement("span");
    label.textContent = lang || "code";
    const copy = document.createElement("button");
    copy.textContent = "Copy code";
    copy.addEventListener("click", () => {
      navigator.clipboard.writeText(code.textContent);
      copy.textContent = "Copied!";
      setTimeout(() => (copy.textContent = "Copy code"), 1500);
    });
    header.append(label, copy);
    pre.replaceWith(wrap);
    wrap.append(header, pre);
    try { hljs.highlightElement(code); } catch {}
  });
  return tpl;
}

/* ---------------- sidebar ---------------- */

async function loadConversations() {
  conversations = await fetch("/api/conversations").then((r) => r.json());
  renderConvList();
}

function groupLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 Days";
  if (diffDays < 30) return "Previous 30 Days";
  return "Older";
}

function renderConvList() {
  const q = searchInput.value.trim().toLowerCase();
  convListEl.innerHTML = "";
  let lastGroup = null;
  for (const c of conversations) {
    if (q && !c.title.toLowerCase().includes(q)) continue;
    if (selectedProjectId && c.projectId !== selectedProjectId) continue;
    const g = groupLabel(c.updatedAt);
    if (g !== lastGroup) {
      const label = document.createElement("div");
      label.className = "conv-group-label";
      label.textContent = g;
      convListEl.appendChild(label);
      lastGroup = g;
    }
    const item = document.createElement("div");
    item.className = "conv-item" + (currentConv?.id === c.id ? " active" : "");
    const title = document.createElement("span");
    title.className = "conv-title";
    title.textContent = c.title;
    const menuBtn = document.createElement("button");
    menuBtn.className = "conv-menu-btn";
    menuBtn.textContent = "⋯";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openConvMenu(item, c);
    });
    item.append(title, menuBtn);
    item.addEventListener("click", () => openConversation(c.id));
    convListEl.appendChild(item);
  }
}

function openConvMenu(item, c) {
  closeConvMenus();
  const menu = document.createElement("div");
  menu.className = "conv-menu";
  const rename = document.createElement("button");
  rename.textContent = "Rename";
  rename.addEventListener("click", async (e) => {
    e.stopPropagation();
    const name = prompt("Rename chat", c.title);
    closeConvMenus();
    if (name?.trim()) {
      await fetch(`/api/conversations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim() }),
      });
      await loadConversations();
    }
  });
  const del = document.createElement("button");
  del.className = "danger";
  del.textContent = "Delete";
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeConvMenus();
    await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
    if (currentConv?.id === c.id) newChat();
    await loadConversations();
  });
  menu.append(rename, del);
  item.appendChild(menu);
}
function closeConvMenus() {
  document.querySelectorAll(".conv-menu").forEach((m) => m.remove());
}
document.addEventListener("click", closeConvMenus);

/* ---------------- chat rendering ---------------- */

function setEmptyState(on) {
  app.classList.toggle("empty", on);
}

function addUserMessage(text, attachments = []) {
  const msg = document.createElement("div");
  msg.className = "msg user";
  const box = document.createElement("div");
  box.className = "msg-box";
  if (attachments.length) {
    const chips = document.createElement("div");
    chips.className = "attachment-chips";
    for (const a of attachments) {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      if (a.isImage) {
        const img = document.createElement("img");
        img.src = a.url;
        chip.appendChild(img);
      }
      const name = document.createElement("span");
      name.textContent = a.name;
      chip.appendChild(name);
      chips.appendChild(chip);
    }
    box.appendChild(chips);
  }
  if (text) {
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    box.appendChild(bubble);
  }
  msg.appendChild(box);
  messagesEl.appendChild(msg);
  scrollToBottom();
}

function fmtDuration(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function buildAgentPanel(open) {
  const panel = document.createElement("div");
  panel.className = "agent-panel" + (open ? " open" : "");
  const header = document.createElement("button");
  header.className = "agent-header";
  header.innerHTML =
    '<svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg><span class="agent-title"></span>';
  const timeline = document.createElement("div");
  timeline.className = "agent-timeline";
  header.addEventListener("click", () => panel.classList.toggle("open"));
  panel.append(header, timeline);
  return { panel, timeline, title: header.querySelector(".agent-title") };
}

function renderActivityEntry(timeline, items, ev) {
  const key = ev.id || ev.kind + "|" + (ev.detail || ev.label);
  let node = items.get(key);
  if (!node) {
    node = document.createElement("div");
    node.innerHTML =
      '<div class="activity-row"><span class="ind"></span><span class="label"></span></div><span class="detail"></span>';
    timeline.appendChild(node);
    items.set(key, node);
  }
  node.className = "activity kind-" + ev.kind;
  node.querySelector(".ind").className = "ind" + (ev.done ? "" : " spinner");
  const label = node.querySelector(".label");
  label.textContent = ev.kind === "reasoning" ? "" : ev.label;
  node.querySelector(".detail").textContent = ev.detail || "";
  if (ev.output && !node.querySelector(".output")) {
    const toggle = document.createElement("button");
    toggle.className = "output-toggle";
    toggle.textContent = "Show output";
    const out = document.createElement("div");
    out.className = "output collapsed";
    toggle.addEventListener("click", () => {
      out.classList.toggle("collapsed");
      toggle.textContent = out.classList.contains("collapsed") ? "Show output" : "Hide output";
    });
    node.append(toggle, out);
  }
  if (ev.output) node.querySelector(".output").textContent = ev.output;
}

function addAssistantShell() {
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  const { panel, timeline, title } = buildAgentPanel(true);
  title.className = "agent-title thinking-shimmer";
  title.textContent = "Thinking…";
  const content = document.createElement("div");
  content.className = "content";
  msg.append(panel, content);
  messagesEl.appendChild(msg);
  scrollToBottom();
  const shell = {
    msg,
    panel,
    timeline,
    title,
    content,
    activityItems: new Map(),
    startedAt: Date.now(),
    finalized: false,
  };
  shell.timer = setInterval(() => {
    if (shell.title.classList.contains("thinking-shimmer")) {
      shell.title.textContent = `Thinking… ${fmtDuration(Date.now() - shell.startedAt)}`;
    }
  }, 1000);
  return shell;
}

function finalizeShell(shell) {
  if (shell.finalized) return;
  shell.finalized = true;
  clearInterval(shell.timer);
  if (shell.activityItems.size === 0) {
    shell.panel.remove();
    return;
  }
  shell.timeline.querySelectorAll(".spinner").forEach((s) => (s.className = "ind"));
  shell.title.className = "agent-title";
  shell.title.textContent = `Worked for ${fmtDuration(Date.now() - shell.startedAt)}`;
  shell.panel.classList.remove("open");
}

function upsertActivity(shell, ev) {
  renderActivityEntry(shell.timeline, shell.activityItems, ev);
  scrollToBottom();
}

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function renderConversation() {
  messagesEl.innerHTML = "";
  const msgs = currentConv?.messages || [];
  setEmptyState(msgs.length === 0);
  msgs.forEach((m, i) => {
    if (m.role === "user") addUserMessage(m.text, m.attachments || []);
    else {
      const msg = document.createElement("div");
      msg.className = "msg assistant";
      if (m.activities?.length) {
        const { panel, timeline, title } = buildAgentPanel(false);
        title.textContent = `Worked for ${fmtDuration(m.durationMs || 0)}`;
        const items = new Map();
        for (const ev of m.activities) renderActivityEntry(timeline, items, { ...ev, done: true });
        msg.appendChild(panel);
      }
      const content = document.createElement("div");
      content.className = "content";
      content.appendChild(renderMarkdown(m.text, { planLive: i === msgs.length - 1 }));
      msg.appendChild(content);
      messagesEl.appendChild(msg);
    }
  });
  scrollToBottom();
}

async function openConversation(id) {
  currentConv = await fetch(`/api/conversations/${id}`).then((r) => r.json());
  renderConvList();
  renderConversation();
}

function newChat() {
  currentConv = null;
  messagesEl.innerHTML = "";
  setEmptyState(true);
  renderConvList();
  promptInput.focus();
}

/* ---------------- sending ---------------- */

async function sendMessage() {
  if (streaming) {
    streamAbort?.abort();
    return;
  }
  const text = promptInput.value.trim();
  if (!text && pendingAttachments.length === 0) return;

  const attachments = pendingAttachments.slice();
  pendingAttachments = [];
  attachPreviews.innerHTML = "";
  promptInput.value = "";
  autogrow();
  await streamTurn({ text, attachments, researchMode: modeForSend() });
}

// One chat turn: echo the user bubble, open an assistant shell, stream SSE.
async function streamTurn({ text, attachments = [], researchMode = "", approvedPlan = [] }) {
  if (!currentConv) {
    currentConv = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProjectId }),
    }).then((r) => r.json());
  }
  setEmptyState(false);
  addUserMessage(text, attachments);
  const shell = addAssistantShell();
  setStreaming(true);

  streamAbort = new AbortController();
  let gotFinal = false;
  try {
    const res = await fetch(`/api/conversations/${currentConv.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, attachments, researchMode, approvedPlan }),
      signal: streamAbort.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!chunk.startsWith("data: ")) continue;
        let ev;
        try { ev = JSON.parse(chunk.slice(6)); } catch { continue; }
        handleStreamEvent(ev, shell, () => (gotFinal = true));
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      shell.content.innerHTML = "";
      shell.content.appendChild(renderMarkdown(`⚠️ **Error:** ${err.message}`));
    }
  } finally {
    finalizeShell(shell);
    if (!gotFinal && shell.content.childNodes.length === 0) {
      shell.content.appendChild(renderMarkdown("_(no response)_"));
    }
    setStreaming(false);
    loadConversations();
  }
}

function handleStreamEvent(ev, shell, markFinal) {
  switch (ev.type) {
    case "title":
      loadConversations();
      break;
    case "activity":
      upsertActivity(shell, ev);
      break;
    case "assistant_delta":
    case "assistant":
      shell.content.innerHTML = "";
      shell.content.appendChild(renderMarkdown(ev.text));
      if (ev.type === "assistant") markFinal();
      scrollToBottom();
      break;
    case "error":
      shell.content.appendChild(renderMarkdown(`\n\n⚠️ ${ev.message}`));
      break;
    case "done":
      markFinal();
      finalizeShell(shell);
      break;
  }
}

function setStreaming(on) {
  streaming = on;
  sendBtn.disabled = !on && !promptInput.value.trim() && pendingAttachments.length === 0;
  sendIcon.style.display = on ? "none" : "";
  stopIcon.style.display = on ? "" : "none";
  if (on) sendBtn.disabled = false;
}

/* ---------------- attachments ---------------- */

async function uploadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
  pendingAttachments.push(...res.files);
  renderAttachPreviews();
}

$("#attach-btn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  uploadFiles(fileInput.files);
  fileInput.value = "";
});

// drag & drop anywhere in the main area
const composerEl = $("#composer");
["dragenter", "dragover"].forEach((evt) =>
  document.addEventListener(evt, (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      composerEl.classList.add("dragover");
    }
  }));
["dragleave", "drop"].forEach((evt) =>
  document.addEventListener(evt, (e) => {
    if (evt === "drop") e.preventDefault();
    if (evt === "dragleave" && e.relatedTarget) return;
    composerEl.classList.remove("dragover");
  }));
document.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
});

// paste files/screenshots straight into the composer
promptInput.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    uploadFiles(files);
  }
});

function renderAttachPreviews() {
  attachPreviews.innerHTML = "";
  pendingAttachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    if (a.isImage) {
      const img = document.createElement("img");
      img.src = a.url;
      chip.appendChild(img);
    }
    const name = document.createElement("span");
    name.textContent = a.name;
    const x = document.createElement("button");
    x.textContent = "✕";
    x.style.cssText = "background:none;border:none;cursor:pointer;color:inherit";
    x.addEventListener("click", () => {
      pendingAttachments.splice(i, 1);
      renderAttachPreviews();
    });
    chip.append(name, x);
    attachPreviews.appendChild(chip);
  });
  setStreaming(streaming);
}

/* ---------------- composer ---------------- */

function autogrow() {
  promptInput.style.height = "auto";
  promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
}
promptInput.addEventListener("input", () => {
  autogrow();
  if (!streaming) sendBtn.disabled = !promptInput.value.trim() && pendingAttachments.length === 0;
});
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener("click", sendMessage);

/* ---------------- settings modal ---------------- */

const backdrop = $("#modal-backdrop");
$("#settings-btn").addEventListener("click", async () => {
  const [settings, mem] = await Promise.all([
    fetch("/api/settings").then((r) => r.json()),
    fetch("/api/memory").then((r) => r.json()),
  ]);
  $("#set-nickname").value = settings.nickname || "";
  $("#set-instructions").value = settings.customInstructions || "";
  $("#set-memory-enabled").checked = settings.memoryEnabled !== false;
  $("#set-memory").value = mem.memory || "";
  backdrop.hidden = false;
});
$("#modal-close").addEventListener("click", () => (backdrop.hidden = true));
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) backdrop.hidden = true;
});
$("#settings-save").addEventListener("click", async () => {
  await Promise.all([
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: $("#set-nickname").value,
        customInstructions: $("#set-instructions").value,
        memoryEnabled: $("#set-memory-enabled").checked,
      }),
    }),
    fetch("/api/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory: $("#set-memory").value }),
    }),
  ]);
  backdrop.hidden = true;
});

/* ---------------- model & effort picker ---------------- */

const modelMenu = $("#model-menu");
const modelLabel = $("#model-label");
const modelCustom = $("#model-custom");
let currentSettings = {};

function updateModelUI() {
  const model = currentSettings.model || "";
  const effort = currentSettings.reasoningEffort || "";
  modelLabel.textContent = (model || "codex") + (effort ? ` · ${effort}` : "");
  const presets = [...modelMenu.querySelectorAll("[data-model]")].map((b) => b.dataset.model);
  modelMenu.querySelectorAll("[data-model]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.model === model));
  modelMenu.querySelectorAll("[data-effort]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.effort === effort));
  modelCustom.value = model && !presets.includes(model) ? model : "";
}

async function saveModelSettings(patch) {
  currentSettings = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => r.json());
  updateModelUI();
}

async function loadModelSettings() {
  currentSettings = await fetch("/api/settings").then((r) => r.json());
  updateModelUI();
}

$("#model-badge").addEventListener("click", (e) => {
  e.stopPropagation();
  modelMenu.hidden = !modelMenu.hidden;
});
modelMenu.addEventListener("click", (e) => e.stopPropagation());
modelMenu.querySelectorAll("[data-model]").forEach((b) =>
  b.addEventListener("click", () => saveModelSettings({ model: b.dataset.model })));
modelMenu.querySelectorAll("[data-effort]").forEach((b) =>
  b.addEventListener("click", () => saveModelSettings({ reasoningEffort: b.dataset.effort })));
modelCustom.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveModelSettings({ model: modelCustom.value.trim() });
});
document.addEventListener("click", () => (modelMenu.hidden = true));

/* ---------------- research mode ---------------- */

let currentMode = "";
const modeMenu = $("#mode-menu");
const modeBtn = $("#mode-btn");
const skipPlanCheck = $("#skip-plan-check");
const SKIP_PLAN_KEY = "mockchatgpt.skipPlanApproval";

// Research modes plan first ("wide"), then run on approval ("wide-exec").
// With plan approval skipped we jump straight to the exec protocol.
function modeForSend() {
  if (!currentMode) return "";
  return skipPlanCheck.checked ? `${currentMode}-exec` : currentMode;
}

function updateModeUI() {
  const labels = { "": "Research", wide: "Research: Wide", deep: "Research: Deep" };
  $("#mode-label").textContent = labels[currentMode];
  modeBtn.classList.toggle("active", !!currentMode);
  modeMenu.querySelectorAll("[data-mode]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.mode === currentMode));
}

skipPlanCheck.checked = localStorage.getItem(SKIP_PLAN_KEY) === "1";
skipPlanCheck.addEventListener("change", () =>
  localStorage.setItem(SKIP_PLAN_KEY, skipPlanCheck.checked ? "1" : "0"));
modeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  modeMenu.hidden = !modeMenu.hidden;
});
modeMenu.addEventListener("click", (e) => e.stopPropagation());
modeMenu.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    currentMode = b.dataset.mode;
    modeMenu.hidden = true;
    updateModeUI();
  }));
document.addEventListener("click", () => (modeMenu.hidden = true));

/* ---------------- projects ---------------- */

let projects = [];
let selectedProjectId = null;
let editingProjectId = null;

async function loadProjects() {
  projects = await fetch("/api/projects").then((r) => r.json());
  renderProjects();
}

function renderProjects() {
  const list = $("#project-list");
  list.innerHTML = "";
  for (const p of projects) {
    const item = document.createElement("div");
    item.className = "project-item" + (selectedProjectId === p.id ? " active" : "");
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = "📁";
    const name = document.createElement("span");
    name.className = "p-name";
    name.textContent = p.name;
    const menu = document.createElement("button");
    menu.className = "conv-menu-btn";
    menu.textContent = "⋯";
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      openProjectModal(p.id);
    });
    item.append(icon, name, menu);
    item.addEventListener("click", () => {
      selectedProjectId = selectedProjectId === p.id ? null : p.id;
      renderProjects();
      renderConvList();
      newChat();
    });
    list.appendChild(item);
  }
}

function openProjectModal(id) {
  editingProjectId = id;
  const p = id && projects.find((p) => p.id === id);
  $("#project-modal-title").textContent = p ? "Edit project" : "New project";
  $("#project-name").value = p?.name || "";
  $("#project-instructions").value = p?.instructions || "";
  $("#project-delete").hidden = !p;
  $("#project-files-wrap").hidden = !p;
  if (p) refreshProjectFiles(p.id);
  $("#project-backdrop").hidden = false;
}

async function refreshProjectFiles(id) {
  const { files } = await fetch(`/api/projects/${id}/files`).then((r) => r.json());
  $("#project-file-list").textContent = files.length ? files.join(" · ") : "No files yet.";
}

$("#project-add-btn").addEventListener("click", () => openProjectModal(null));
$("#project-save").addEventListener("click", async () => {
  const body = { name: $("#project-name").value, instructions: $("#project-instructions").value };
  if (editingProjectId) {
    await fetch(`/api/projects/${editingProjectId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } else {
    const p = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((r) => r.json());
    if (p.id) selectedProjectId = p.id;
  }
  $("#project-backdrop").hidden = true;
  await loadProjects();
  renderConvList();
});
$("#project-delete").addEventListener("click", async () => {
  if (!editingProjectId) return;
  if (!confirm("Delete this project? Its chats are kept (moved out of the project).")) return;
  await fetch(`/api/projects/${editingProjectId}`, { method: "DELETE" });
  if (selectedProjectId === editingProjectId) selectedProjectId = null;
  $("#project-backdrop").hidden = true;
  await loadProjects();
  await loadConversations();
});
$("#project-file-add").addEventListener("click", () => $("#project-file-input").click());
$("#project-file-input").addEventListener("change", async () => {
  const input = $("#project-file-input");
  if (!input.files.length || !editingProjectId) return;
  const fd = new FormData();
  for (const f of input.files) fd.append("files", f);
  input.value = "";
  await fetch(`/api/projects/${editingProjectId}/files`, { method: "POST", body: fd });
  refreshProjectFiles(editingProjectId);
});

/* ---------------- scheduled tasks ---------------- */

const TASK_TYPE_FIELDS = { daily: ["task-time"], weekly: ["task-weekday", "task-time"], interval: ["task-minutes"], once: ["task-once"] };

$("#task-type").addEventListener("change", () => {
  const visible = TASK_TYPE_FIELDS[$("#task-type").value];
  for (const id of ["task-time", "task-weekday", "task-minutes", "task-once"]) {
    document.getElementById(id).hidden = !visible.includes(id);
  }
});

function fmtWhen(ts) {
  return ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

async function refreshTasks() {
  const tasks = await fetch("/api/tasks").then((r) => r.json());
  const list = $("#task-list");
  list.innerHTML = tasks.length ? "" : '<div class="mcp-note">No scheduled tasks yet.</div>';
  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "task-row";
    const grow = document.createElement("div");
    grow.className = "grow";
    grow.innerHTML = `<div class="t-prompt"></div><div class="meta"></div>`;
    grow.querySelector(".t-prompt").textContent = t.prompt;
    grow.querySelector(".meta").textContent =
      `${t.enabled ? "next " + fmtWhen(t.nextRun) : "paused"} · last ${fmtWhen(t.lastRun)}${t.lastStatus && t.lastStatus !== "ok" ? " · " + t.lastStatus : ""}`;
    row.appendChild(grow);
    const mk = (label, fn, danger) => {
      const b = document.createElement("button");
      b.className = "mini-btn" + (danger ? " danger" : "");
      b.textContent = label;
      b.addEventListener("click", fn);
      row.appendChild(b);
    };
    if (t.conversationId) mk("View", () => { $("#tasks-backdrop").hidden = true; openConversation(t.conversationId); });
    mk("Run now", async () => { await fetch(`/api/tasks/${t.id}/run`, { method: "POST" }); alert("Started — the result will appear in the task's chat shortly."); });
    mk(t.enabled ? "Pause" : "Resume", async () => {
      await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !t.enabled }) });
      refreshTasks();
    });
    mk("Delete", async () => {
      await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      refreshTasks();
    }, true);
    list.appendChild(row);
  }
}

$("#tasks-btn").addEventListener("click", () => {
  $("#tasks-backdrop").hidden = false;
  refreshTasks();
});
$("#task-create").addEventListener("click", async () => {
  const type = $("#task-type").value;
  const schedule = { type };
  if (type === "daily") schedule.time = $("#task-time").value;
  if (type === "weekly") { schedule.time = $("#task-time").value; schedule.weekday = Number($("#task-weekday").value); }
  if (type === "interval") schedule.minutes = Number($("#task-minutes").value);
  if (type === "once") schedule.at = new Date($("#task-once").value).toISOString();
  const res = await fetch("/api/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: $("#task-prompt").value, schedule }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  $("#task-prompt").value = "";
  refreshTasks();
  loadConversations();
});

/* ---------------- MCP connectors ---------------- */

function mcpRow({ title, subtitle, action }) {
  const row = document.createElement("div");
  row.className = "mcp-row";
  const grow = document.createElement("div");
  grow.className = "grow";
  grow.innerHTML = `<div></div><div class="meta"></div>`;
  grow.children[0].textContent = title;
  grow.children[1].textContent = subtitle;
  row.appendChild(grow);
  if (action) row.appendChild(action);
  return row;
}

async function refreshMcp() {
  $("#mcp-installed").innerHTML = '<div class="mcp-note">Loading…</div>';
  const data = await fetch("/api/mcp").then((r) => r.json());
  if (data.error) {
    $("#mcp-installed").innerHTML = "";
    $("#mcp-installed").appendChild(Object.assign(document.createElement("div"), { className: "mcp-note", textContent: "Error: " + data.error }));
    return;
  }
  const inst = $("#mcp-installed");
  inst.innerHTML = data.servers.length ? "" : '<div class="mcp-note">No MCP servers configured.</div>';
  for (const s of data.servers) {
    const un = document.createElement("button");
    un.className = "mini-btn danger";
    un.textContent = "Uninstall";
    un.addEventListener("click", async () => {
      if (!confirm(`Remove MCP server "${s.name}" from Codex? This affects all Codex sessions, not just this app.`)) return;
      const res = await fetch(`/api/mcp/${s.name}`, { method: "DELETE" }).then((r) => r.json());
      if (res.error) alert(res.error);
      refreshMcp();
    });
    inst.appendChild(mcpRow({
      title: s.name + (s.appInstalled ? "  ·  added via app" : ""),
      subtitle: [s.command, ...(s.args || [])].join(" ").slice(0, 90),
      action: un,
    }));
  }
  const cat = $("#mcp-catalog");
  cat.innerHTML = "";
  for (const c of data.catalog) {
    let action;
    if (c.installed) {
      action = Object.assign(document.createElement("span"), { className: "meta", textContent: "Installed ✓" });
    } else if (!c.available) {
      action = Object.assign(document.createElement("span"), { className: "meta", textContent: `needs ${c.needs}` });
    } else {
      action = document.createElement("button");
      action.className = "mini-btn";
      action.textContent = "Install";
      action.addEventListener("click", async () => {
        action.textContent = "Installing…";
        const res = await fetch("/api/mcp/install", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: c.id, command: c.command, args: c.args }),
        }).then((r) => r.json());
        if (res.error) alert(res.error);
        refreshMcp();
      });
    }
    cat.appendChild(mcpRow({ title: c.title, subtitle: c.description, action }));
  }
}

$("#mcp-btn").addEventListener("click", () => {
  $("#mcp-backdrop").hidden = false;
  refreshMcp();
});
$("#mcp-add").addEventListener("click", async () => {
  const name = $("#mcp-name").value.trim();
  const tokens = $("#mcp-cmd").value.trim().split(/\s+/).filter(Boolean);
  const env = {};
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[tokens.length - 1])) {
    const [k, ...v] = tokens.pop().split("=");
    env[k] = v.join("=");
  }
  if (!name || !tokens.length) return alert("Name and command are required.");
  const res = await fetch("/api/mcp/install", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, command: tokens[0], args: tokens.slice(1), env }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  $("#mcp-name").value = "";
  $("#mcp-cmd").value = "";
  refreshMcp();
});

// approval card rendered when the agent proposes an MCP install in chat
function buildMcpInstallCard(jsonText) {
  let spec;
  try {
    spec = JSON.parse(jsonText.trim());
  } catch {
    return null;
  }
  if (!spec?.name || (!spec.command && !spec.url)) return null;
  const card = document.createElement("div");
  card.className = "mcp-card";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `🧩 Connector proposal: ${spec.name}`;
  const reason = document.createElement("div");
  reason.textContent = spec.reason || "";
  const cmd = document.createElement("div");
  cmd.className = "cmd";
  cmd.textContent = spec.url ? spec.url : [spec.command, ...(spec.args || [])].join(" ");
  card.append(title, reason, cmd);
  const envInputs = {};
  for (const [k, v] of Object.entries(spec.env || {})) {
    const rowEl = document.createElement("div");
    rowEl.className = "env-row";
    const label = document.createElement("code");
    label.textContent = k;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = v || "value…";
    input.value = v || "";
    envInputs[k] = input;
    rowEl.append(label, input);
    card.appendChild(rowEl);
  }
  const actions = document.createElement("div");
  actions.className = "actions";
  const approve = document.createElement("button");
  approve.className = "primary";
  approve.textContent = "Approve & install";
  const status = document.createElement("div");
  status.className = "status";
  approve.addEventListener("click", async () => {
    approve.disabled = true;
    status.textContent = "Installing…";
    const env = {};
    for (const [k, input] of Object.entries(envInputs)) if (input.value.trim()) env[k] = input.value.trim();
    const res = await fetch("/api/mcp/install", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: spec.name, command: spec.command, args: spec.args || [], env, url: spec.url }),
    }).then((r) => r.json());
    status.textContent = res.error ? "Failed: " + res.error : `Installed ✓ — "${spec.name}" is now available to the agent in new messages.`;
    if (res.error) approve.disabled = false;
  });
  actions.appendChild(approve);
  card.append(actions, status);
  return card;
}

// Editable plan card rendered when the agent proposes a research plan in chat.
// `live` is false for plans from older messages — those render read-only.
function buildResearchPlanCard(jsonText, live) {
  let spec;
  try {
    spec = JSON.parse(jsonText.trim());
  } catch {
    return null;
  }
  const mode = spec?.mode;
  if ((mode !== "wide" && mode !== "deep") || !Array.isArray(spec.items) || !spec.items.length) return null;

  const card = document.createElement("div");
  card.className = "mcp-card plan-card";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `🔎 Research plan — ${mode === "wide" ? "Wide" : "Deep"}`;
  const question = document.createElement("div");
  question.textContent = spec.question || "";
  const rows = document.createElement("div");
  rows.className = "plan-rows";
  const status = document.createElement("div");
  status.className = "status";
  card.append(title, question, rows);

  const inputs = [];
  const addRow = (value, focus) => {
    const row = document.createElement("div");
    row.className = "plan-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = String(value ?? "");
    input.disabled = !live;
    const remove = document.createElement("button");
    remove.className = "plan-remove";
    remove.textContent = "✕";
    remove.title = "Remove this item";
    remove.addEventListener("click", () => {
      inputs.splice(inputs.indexOf(input), 1);
      row.remove();
    });
    inputs.push(input);
    row.appendChild(input);
    if (live) row.appendChild(remove);
    rows.appendChild(row);
    if (focus) input.focus();
  };
  spec.items.forEach((item) => addRow(item, false));

  if (Array.isArray(spec.queries) && spec.queries.length) {
    const queries = document.createElement("div");
    queries.className = "cmd";
    queries.textContent = "Planned searches: " + spec.queries.join(" · ");
    card.appendChild(queries);
  }

  if (!live) {
    status.textContent = "Plan expired — the conversation has moved on. Pick a research mode again to plan afresh.";
    card.appendChild(status);
    return card;
  }

  const add = document.createElement("button");
  add.className = "plan-add";
  add.textContent = "+ Add item";
  add.addEventListener("click", () => addRow("", true));
  const actions = document.createElement("div");
  actions.className = "actions";
  const start = document.createElement("button");
  start.className = "primary";
  start.textContent = "Start research";
  const cancel = document.createElement("button");
  cancel.className = "plan-cancel";
  cancel.textContent = "Cancel";

  const freeze = (msg) => {
    inputs.forEach((i) => (i.disabled = true));
    card.querySelectorAll(".plan-remove").forEach((b) => b.remove());
    add.remove();
    actions.remove();
    status.textContent = msg;
  };
  start.addEventListener("click", () => {
    if (streaming) {
      status.textContent = "Wait for the current turn to finish first.";
      return;
    }
    const items = inputs.map((i) => i.value.trim()).filter(Boolean);
    if (!items.length) {
      status.textContent = "Add at least one item before starting.";
      return;
    }
    freeze(`Plan approved ✓ — running ${items.length} ${mode === "wide" ? "angles" : "rounds"}.`);
    streamTurn({
      text: "Start the research using the approved plan.",
      researchMode: `${mode}-exec`,
      approvedPlan: items,
    });
  });
  cancel.addEventListener("click", () => freeze("Plan cancelled — ask something else whenever you like."));

  actions.append(start, cancel);
  card.append(add, actions, status);
  return card;
}

/* ---------------- generic modal close ---------------- */

document.querySelectorAll(".modal-x[data-close]").forEach((b) =>
  b.addEventListener("click", () => (document.getElementById(b.dataset.close).hidden = true)));
document.querySelectorAll(".backdrop").forEach((bd) =>
  bd.addEventListener("click", (e) => {
    if (e.target === bd) bd.hidden = true;
  }));

/* ---------------- misc ---------------- */

$("#new-chat-btn").addEventListener("click", newChat);
$("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("hidden"));
searchInput.addEventListener("input", renderConvList);

newChat();
loadConversations();
loadModelSettings();
loadProjects();
updateModeUI();
