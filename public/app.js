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

function renderMarkdown(md) {
  const html = DOMPurify.sanitize(marked.parse(md || ""));
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  // dress up code blocks like ChatGPT
  tpl.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "";
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
  for (const m of msgs) {
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
      content.appendChild(renderMarkdown(m.text));
      msg.appendChild(content);
      messagesEl.appendChild(msg);
    }
  }
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

  if (!currentConv) {
    currentConv = await fetch("/api/conversations", { method: "POST" }).then((r) => r.json());
  }
  const attachments = pendingAttachments.slice();
  pendingAttachments = [];
  attachPreviews.innerHTML = "";
  promptInput.value = "";
  autogrow();
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
      body: JSON.stringify({ text, attachments }),
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

/* ---------------- misc ---------------- */

$("#new-chat-btn").addEventListener("click", newChat);
$("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("hidden"));
searchInput.addEventListener("input", renderConvList);

newChat();
loadConversations();
loadModelSettings();
