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
  box.style.maxWidth = "100%";
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

function addAssistantShell() {
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  const activity = document.createElement("div");
  activity.className = "activity-list";
  const thinking = document.createElement("div");
  thinking.className = "thinking-shimmer";
  thinking.textContent = "Thinking";
  activity.appendChild(thinking);
  const content = document.createElement("div");
  content.className = "content";
  msg.append(activity, content);
  messagesEl.appendChild(msg);
  scrollToBottom();
  return { msg, activity, content, thinking, activityItems: new Map() };
}

function upsertActivity(shell, ev) {
  shell.thinking?.remove();
  shell.thinking = null;
  const key = ev.kind + "|" + (ev.detail || ev.label);
  let node = shell.activityItems.get(key);
  if (!node) {
    node = document.createElement("div");
    node.className = "activity";
    node.innerHTML = `<div class="activity-row"><span class="ind"></span><span class="label"></span><span class="detail"></span></div><div class="output"></div>`;
    shell.activity.appendChild(node);
    shell.activityItems.set(key, node);
  }
  const row = node.querySelector(".activity-row");
  const ind = node.querySelector(".ind");
  ind.className = "ind " + (ev.done ? "dot" : "spinner");
  node.querySelector(".label").textContent = ev.label;
  node.querySelector(".detail").textContent = ev.detail || "";
  if (ev.output) {
    node.querySelector(".output").textContent = ev.output;
    row.classList.add("expandable");
    row.onclick = () => node.classList.toggle("open");
  }
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
    shell.thinking?.remove();
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
      shell.thinking?.remove();
      shell.thinking = null;
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

$("#attach-btn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  if (!fileInput.files.length) return;
  const fd = new FormData();
  for (const f of fileInput.files) fd.append("files", f);
  fileInput.value = "";
  const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
  pendingAttachments.push(...res.files);
  renderAttachPreviews();
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

/* ---------------- misc ---------------- */

$("#new-chat-btn").addEventListener("click", newChat);
$("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("hidden"));
searchInput.addEventListener("input", renderConvList);

newChat();
loadConversations();
