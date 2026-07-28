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
let streamConvId = null; // conversation whose turn is in flight (for /stop)

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
    if (lang === "mcp-install" || lang === "task-create") {
      const card = lang === "mcp-install"
        ? buildMcpInstallCard(code.textContent)
        : buildTaskCreateCard(code.textContent);
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
  detectTaskRuns();
  renderConvList();
  updateBranchButton();
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
    if (c.parentId) {
      const fork = document.createElement("span");
      fork.className = "conv-fork";
      fork.textContent = "⑂";
      fork.title = "Branched chat";
      item.appendChild(fork);
    }
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
  return msg;
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
  if (ev.imageUrl) {
    let shot = node.querySelector(".activity-shot");
    if (!shot) {
      shot = document.createElement("a");
      shot.className = "activity-shot";
      shot.target = "_blank";
      shot.rel = "noopener";
      shot.appendChild(document.createElement("img"));
      node.appendChild(shot);
    }
    shot.href = ev.imageUrl;
    const img = shot.firstChild;
    if (img.getAttribute("src") !== ev.imageUrl) {
      img.src = ev.imageUrl;
      img.alt = ev.detail || "Browser screenshot";
    }
  }
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
  shell.title.textContent = `Worked for ${fmtDuration(Date.now() - shell.startedAt)}${fmtUsage(shell.usage)}`;
  shell.panel.classList.remove("open");
}

function fmtTok(n) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n || 0);
}
function fmtUsage(u) {
  if (!u || (!u.input_tokens && !u.output_tokens)) return "";
  return ` · ${fmtTok(u.input_tokens)}→${fmtTok(u.output_tokens)} tok`;
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
  // the server can only rewrite a transcript ending in question → answer, so
  // that is exactly when the regenerate/edit controls are offered
  const editable = !streaming && msgs.at(-1)?.role === "assistant" && msgs.at(-2)?.role === "user";
  msgs.forEach((m, i) => {
    if (m.role === "user") {
      const msg = addUserMessage(m.text, m.attachments || []);
      if (editable && i === msgs.length - 2) {
        const box = msg.querySelector(".msg-box");
        const bubble = box.querySelector(".bubble");
        if (bubble) {
          addMessageActions(box, [["✏️", "Edit message", () => startEditing(box, bubble, m.text)]]);
        }
      }
    } else {
      const msg = document.createElement("div");
      msg.className = "msg assistant";
      if (m.activities?.length) {
        const { panel, timeline, title } = buildAgentPanel(false);
        title.textContent = `Worked for ${fmtDuration(m.durationMs || 0)}${fmtUsage(m.usage)}`;
        const items = new Map();
        for (const ev of m.activities) renderActivityEntry(timeline, items, { ...ev, done: true });
        msg.appendChild(panel);
      }
      const content = document.createElement("div");
      content.className = "content";
      content.appendChild(renderMarkdown(m.text, { planLive: i === msgs.length - 1 }));
      msg.appendChild(content);
      // regenerate only rewrites the tail, but branching works from any answer
      const actions = [];
      if (editable && i === msgs.length - 1) {
        actions.push(["⟳ Regenerate", "Try this answer again", regenerateLast]);
      }
      if (!streaming) {
        actions.push(["⑂ Branch", "Start a new chat that continues from here", () => branchFrom(i)]);
      }
      if (actions.length) addMessageActions(msg, actions);
      messagesEl.appendChild(msg);
    }
  });
  scrollToBottom();
}

async function openConversation(id) {
  currentConv = await fetch(`/api/conversations/${id}`).then((r) => r.json());
  renderConvList();
  renderConversation();
  updateBranchButton();
}

function newChat() {
  currentConv = null;
  messagesEl.innerHTML = "";
  setEmptyState(true);
  renderConvList();
  updateBranchButton();
  promptInput.focus();
}

/* ---------------- sending ---------------- */

async function sendMessage() {
  if (streaming) {
    stopTurn();
    return;
  }
  const text = promptInput.value.trim();
  if (!text && pendingAttachments.length === 0) return;
  ensureNotifyPermission();

  const attachments = pendingAttachments.slice();
  pendingAttachments = [];
  attachPreviews.innerHTML = "";
  promptInput.value = "";
  autogrow();
  await postUserTurn({ text, attachments, researchMode: modeForSend() });
}

// Creates the conversation if needed, echoes the user bubble, then streams.
// Plan-approval cards call this too (with researchMode/approvedPlan).
async function postUserTurn({ text, attachments = [], researchMode = "", approvedPlan = [] }) {
  if (!currentConv) {
    currentConv = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProjectId }),
    }).then((r) => r.json());
  }
  setEmptyState(false);
  addUserMessage(text, attachments);
  await streamTurn({ text, attachments, researchMode, approvedPlan });
}

// Cancels the codex turn server-side. The turn's own request saves whatever the
// agent had written and closes the stream, so we don't abort the fetch here.
async function stopTurn() {
  if (!streamConvId) return;
  try {
    await fetch(`/api/conversations/${streamConvId}/stop`, { method: "POST" });
  } catch {
    streamAbort?.abort(); // server unreachable — at least detach the client
  }
}

// Streams one turn into a fresh assistant shell. `replaceLast` ("assistant" to
// regenerate, "both" to resend an edited question) is passed straight through.
async function streamTurn({ text = "", attachments = [], replaceLast = "", researchMode = "", approvedPlan = [] }) {
  const convId = currentConv.id;
  streamConvId = convId;
  document.querySelectorAll(".msg-actions").forEach((el) => el.remove());
  const shell = addAssistantShell();
  setStreaming(true);

  streamAbort = new AbortController();
  const state = { final: false, saved: false };
  try {
    const res = await fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, attachments, researchMode, approvedPlan, replaceLast }),
      signal: streamAbort.signal,
    });
    if (!res.ok) {
      throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    }
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
        handleStreamEvent(ev, shell, state);
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      shell.content.innerHTML = "";
      shell.content.appendChild(renderMarkdown(`⚠️ **Error:** ${err.message}`));
    }
  } finally {
    finalizeShell(shell);
    if (!state.final && shell.content.childNodes.length === 0) {
      shell.content.appendChild(renderMarkdown("_(no response)_"));
    }
    const reply = shell.content.textContent.trim();
    setStreaming(false);
    await loadConversations();
    streamConvId = null;
    // re-read the saved transcript so currentConv (and the regenerate/edit
    // buttons, which act on its tail) match what the server actually stored
    if (state.saved && currentConv?.id === convId) {
      currentConv = await fetch(`/api/conversations/${convId}`).then((r) => r.json());
      renderConversation();
    }
    if (state.saved && document.hidden) {
      const title = conversations.find((c) => c.id === convId)?.title || "MockChatGPT";
      notify(title, reply.slice(0, 140) || "Response ready", convId);
    }
  }
}

function handleStreamEvent(ev, shell, state) {
  switch (ev.type) {
    case "title":
      loadConversations();
      break;
    case "activity":
      upsertActivity(shell, ev);
      break;
    case "usage":
      if (ev.usage) {
        shell.usage = shell.usage || {};
        for (const [k, v] of Object.entries(ev.usage)) {
          if (typeof v === "number") shell.usage[k] = (shell.usage[k] || 0) + v;
        }
      }
      break;
    case "assistant_delta":
    case "assistant":
    case "stopped":
      shell.content.innerHTML = "";
      shell.content.appendChild(renderMarkdown(ev.text));
      if (ev.type !== "assistant_delta") state.final = true;
      scrollToBottom();
      break;
    case "error":
      shell.content.appendChild(renderMarkdown(`\n\n⚠️ ${ev.message}`));
      break;
    case "done":
      state.final = true;
      state.saved = true;
      finalizeShell(shell);
      break;
  }
}

/* ---------------- regenerate & edit ---------------- */

async function regenerateLast() {
  if (streaming || !currentConv) return;
  if (currentConv.messages.at(-1)?.role !== "assistant") return;
  messagesEl.lastElementChild?.remove(); // the answer the server is about to drop
  await streamTurn({ replaceLast: "assistant" });
}

async function resendEdited(newText) {
  if (streaming || !currentConv) return;
  const msgs = currentConv.messages;
  if (msgs.at(-1)?.role !== "assistant" || msgs.at(-2)?.role !== "user") return;
  const attachments = msgs.at(-2).attachments || [];
  messagesEl.lastElementChild?.remove(); // old answer
  messagesEl.lastElementChild?.remove(); // old question
  addUserMessage(newText, attachments);
  await streamTurn({ text: newText, replaceLast: "both" });
}

function addMessageActions(parent, buttons) {
  const row = document.createElement("div");
  row.className = "msg-actions";
  for (const [label, title, onClick] of buttons) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = title;
    b.textContent = label;
    b.addEventListener("click", onClick);
    row.appendChild(b);
  }
  parent.appendChild(row);
}

// Swaps the user bubble for a textarea; resending replaces both stored messages.
function startEditing(box, bubble, text) {
  box.querySelector(".msg-actions")?.remove();
  box.classList.add("editing");
  bubble.remove();
  const editor = document.createElement("div");
  editor.className = "msg-editor";
  const area = document.createElement("textarea");
  area.rows = Math.min(10, text.split("\n").length + 1);
  area.value = text;
  const actions = document.createElement("div");
  actions.className = "editor-actions";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", renderConversation);
  const send = document.createElement("button");
  send.className = "primary";
  send.textContent = "Send";
  const submit = () => {
    const next = area.value.trim();
    if (!next || next === text) return cancel.click();
    resendEdited(next);
  };
  send.addEventListener("click", submit);
  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      cancel.click();
    }
  });
  actions.append(cancel, send);
  editor.append(area, actions);
  box.appendChild(editor);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
}

function setStreaming(on) {
  streaming = on;
  sendBtn.disabled = !on && !promptInput.value.trim() && pendingAttachments.length === 0;
  sendIcon.style.display = on ? "none" : "";
  stopIcon.style.display = on ? "" : "none";
  if (on) sendBtn.disabled = false;
}

/* ---------------- branch explorer ---------------- */

// A branch family is a root conversation plus everything forked from it,
// reconstructed client-side from the conversation list (which carries
// parentId/forkOfIndex/branchLabel/messageCount for exactly this).
const branchBackdrop = $("#branch-backdrop");
let diffSelection = []; // ids ticked for side-by-side comparison (max 2)

const convMeta = (id) => conversations.find((c) => c.id === id) || null;
const branchName = (c) => (c.branchLabel || c.title || "Untitled");

// Deleting a parent leaves its children pointing at an id that no longer
// exists; such a child is simply treated as a root.
function rootOf(id) {
  let node = convMeta(id);
  const seen = new Set();
  while (node?.parentId && !seen.has(node.id)) {
    seen.add(node.id);
    const parent = convMeta(node.parentId);
    if (!parent) break;
    node = parent;
  }
  return node;
}

const childrenOf = (id) =>
  conversations.filter((c) => c.parentId === id).sort((a, b) => a.createdAt - b.createdAt);

// Depth-first walk of the whole family: [{ conv, depth }], root first.
function familyOf(id) {
  const root = rootOf(id);
  if (!root) return [];
  const out = [];
  const seen = new Set();
  (function walk(node, depth) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    out.push({ conv: node, depth });
    for (const child of childrenOf(node.id)) walk(child, depth + 1);
  })(root, 0);
  return out;
}

// The topbar entry point only appears once a conversation actually has kin.
function updateBranchButton() {
  const size = currentConv ? familyOf(currentConv.id).length : 0;
  $("#branches-btn").hidden = size < 2;
  $("#branches-count").textContent = size >= 2 ? String(size) : "";
}

async function branchFrom(messageIndex) {
  if (streaming || !currentConv) return;
  const label = prompt("Name this branch (optional)", "");
  if (label === null) return;
  const res = await fetch(`/api/conversations/${currentConv.id}/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageIndex, label }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  await loadConversations();
  await openConversation(res.id);
  promptInput.focus();
}

$("#branches-btn").addEventListener("click", () => {
  diffSelection = [];
  branchBackdrop.hidden = false;
  renderBranchTree();
  renderBranchDiff();
});

function renderBranchTree() {
  const treeEl = $("#branch-tree");
  treeEl.innerHTML = "";
  const family = currentConv ? familyOf(currentConv.id) : [];
  if (!family.length) {
    treeEl.innerHTML = '<div class="mcp-note">This chat has no branches.</div>';
    return;
  }
  for (const { conv: c, depth } of family) {
    const row = document.createElement("div");
    row.className = "branch-row";
    row.style.paddingLeft = depth * 20 + "px";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.title = "Compare this branch";
    check.checked = diffSelection.includes(c.id);
    check.addEventListener("change", () => toggleDiffSelection(c.id));
    row.appendChild(check);
    if (depth) {
      const rail = document.createElement("span");
      rail.className = "b-rail";
      rail.textContent = "└";
      row.appendChild(rail);
    }
    const node = document.createElement("button");
    node.type = "button";
    node.className = "branch-node" + (c.id === currentConv?.id ? " current" : "");
    const grow = document.createElement("div");
    grow.className = "grow";
    const title = document.createElement("div");
    title.className = "b-title";
    const name = document.createElement("span");
    name.textContent = (c.parentId ? "⑂ " : "") + branchName(c);
    title.appendChild(name);
    if (c.id === currentConv?.id) {
      const here = document.createElement("span");
      here.className = "b-here";
      here.textContent = "open";
      title.appendChild(here);
    }
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      `${c.messageCount} message${c.messageCount === 1 ? "" : "s"} · ${fmtWhen(c.updatedAt)}` +
      (Number.isInteger(c.forkOfIndex) ? ` · forked at message ${c.forkOfIndex + 1}` : "") +
      (c.parentId && !convMeta(c.parentId) ? " · original chat deleted" : "");
    grow.append(title, meta);
    node.appendChild(grow);
    node.addEventListener("click", () => {
      branchBackdrop.hidden = true;
      openConversation(c.id);
    });
    row.appendChild(node);
    treeEl.appendChild(row);
  }
}

function toggleDiffSelection(id) {
  const at = diffSelection.indexOf(id);
  if (at >= 0) diffSelection.splice(at, 1);
  else if (diffSelection.push(id) > 2) diffSelection.shift(); // keep the two newest picks
  renderBranchTree();
  renderBranchDiff();
}

const lastAssistantText = (conv) =>
  [...(conv.messages || [])].reverse().find((m) => m.role === "assistant")?.text || "";

async function renderBranchDiff() {
  const el = $("#branch-diff");
  if (diffSelection.length !== 2) {
    el.innerHTML = diffSelection.length
      ? '<div class="mcp-note">Tick one more branch to compare their latest answers.</div>'
      : "";
    return;
  }
  const ids = diffSelection.slice();
  el.innerHTML = '<div class="mcp-note">Loading…</div>';
  const convs = await Promise.all(
    ids.map((id) => fetch(`/api/conversations/${id}`).then((r) => r.json())));
  if (diffSelection.join() !== ids.join()) return; // ticked something else while loading
  const [aText, bText] = convs.map(lastAssistantText);
  const ops = wordDiff(aText, bText);
  const changed = ops
    .filter((o) => o.type !== "same")
    .reduce((n, o) => n + o.tokens.filter((t) => t.trim()).length, 0);

  el.innerHTML = "";
  const head = document.createElement("h3");
  head.textContent = "Latest answer, side by side";
  const note = document.createElement("div");
  note.className = "mcp-note";
  note.textContent = !aText || !bText
    ? "One of these branches hasn't answered anything yet."
    : changed === 0
      ? "The two answers are identical."
      : `${changed} words differ — removed on the left, added on the right.`;
  const panes = document.createElement("div");
  panes.className = "diff-panes";
  panes.append(diffPane(convs[0], ops, "del"), diffPane(convs[1], ops, "add"));
  el.append(head, note, panes);
}

function diffPane(conv, ops, side) {
  const pane = document.createElement("div");
  pane.className = "diff-pane";
  const label = document.createElement("div");
  label.className = "d-label";
  label.textContent = (conv.parentId ? "⑂ " : "") + branchName(conv);
  const text = document.createElement("div");
  text.className = "d-text";
  for (const op of ops) {
    if (op.type === "same") text.appendChild(document.createTextNode(op.tokens.join("")));
    else if (op.type === side) {
      const mark = document.createElement(side === "del" ? "del" : "ins");
      mark.textContent = op.tokens.join("");
      text.appendChild(mark);
    }
  }
  if (!text.textContent.trim()) text.textContent = "(no answer in this branch yet)";
  pane.append(label, text);
  return pane;
}

/* --- word-level diff (LCS), no dependencies --- */

// Tokens keep their whitespace, so joining a run of them restores the original
// text verbatim. Above this many DP cells (~16MB) the texts are too far apart
// to be worth aligning and the differing middles are shown wholesale.
const DIFF_CELL_LIMIT = 4_000_000;

const tokenizeWords = (s) => String(s || "").split(/(\s+)/).filter((t) => t !== "");

// → [{ type: "same"|"del"|"add", tokens }]: same+del rebuilds the left text,
// same+add the right one.
function wordDiff(aText, bText) {
  const a = tokenizeWords(aText);
  const b = tokenizeWords(bText);
  // two answers to the same question usually share a long head and tail;
  // peeling those off first keeps the O(n·m) table small
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;
  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);

  const ops = [];
  const push = (type, tokens) => {
    if (!tokens.length) return;
    const last = ops.at(-1);
    if (last?.type === type) last.tokens.push(...tokens);
    else ops.push({ type, tokens: [...tokens] });
  };
  push("same", a.slice(0, head));
  if (aMid.length * bMid.length > DIFF_CELL_LIMIT) {
    push("del", aMid);
    push("add", bMid);
  } else {
    for (const op of lcsDiff(aMid, bMid)) push(op.type, op.tokens);
  }
  push("same", a.slice(a.length - tail));
  return ops;
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…]
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const ops = [];
  const push = (type, token) => {
    const last = ops.at(-1);
    if (last?.type === type) last.tokens.push(token);
    else ops.push({ type, tokens: [token] });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return ops;
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
    // slash-macro menu open → Enter picks the first match instead of sending
    const macroMenu = document.getElementById("macro-menu");
    if (macroMenu && !macroMenu.hidden) {
      macroMenu.querySelector(".menu-item")?.click();
      return;
    }
    sendMessage();
  }
  if (e.key === "Escape") {
    const macroMenu = document.getElementById("macro-menu");
    if (macroMenu) macroMenu.hidden = true;
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
  $("#set-max-minutes").value = Number(settings.maxTurnMinutes) || 0;
  $("#memory-optimize-status").textContent = "";
  settingsCache = settings;
  renderProfiles();
  renderMacros();
  refreshMemoryWeekly();
  backdrop.hidden = false;
});

/* profiles & macros (stored in settings.json) */

let settingsCache = {};

async function patchSettings(patch) {
  settingsCache = await fetch("/api/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  }).then((r) => r.json());
  currentSettings = settingsCache; // keep the composer's macro source fresh
}

function renderProfiles() {
  const sel = $("#profile-select");
  const profiles = settingsCache.profiles || [];
  sel.innerHTML = '<option value="">None</option>' +
    profiles.map((p) => `<option>${p.name.replace(/[<>&"]/g, "")}</option>`).join("");
  sel.value = settingsCache.activeProfile || "";
  const has = !!sel.value;
  $("#profile-edit").hidden = !has;
  $("#profile-delete").hidden = !has;
}

$("#profile-select").addEventListener("change", async (e) => {
  await patchSettings({ activeProfile: e.target.value });
  renderProfiles();
});
$("#profile-add").addEventListener("click", async () => {
  const name = prompt("Profile name (e.g. Work):")?.trim();
  if (!name) return;
  const instructions = prompt(`Instructions for "${name}":`) || "";
  const profiles = (settingsCache.profiles || []).filter((p) => p.name !== name);
  profiles.push({ name, instructions });
  await patchSettings({ profiles, activeProfile: name });
  renderProfiles();
});
$("#profile-edit").addEventListener("click", async () => {
  const name = settingsCache.activeProfile;
  const p = (settingsCache.profiles || []).find((p) => p.name === name);
  if (!p) return;
  const instructions = prompt(`Instructions for "${name}":`, p.instructions);
  if (instructions === null) return;
  p.instructions = instructions;
  await patchSettings({ profiles: settingsCache.profiles });
  renderProfiles();
});
$("#profile-delete").addEventListener("click", async () => {
  const name = settingsCache.activeProfile;
  if (!name || !confirm(`Delete profile "${name}"?`)) return;
  await patchSettings({
    profiles: (settingsCache.profiles || []).filter((p) => p.name !== name),
    activeProfile: "",
  });
  renderProfiles();
});

function renderMacros() {
  const list = $("#macro-list");
  const macros = settingsCache.macros || [];
  list.innerHTML = macros.length ? "" : "No macros yet.";
  for (const m of macros) {
    const row = document.createElement("div");
    const del = document.createElement("button");
    del.className = "output-toggle";
    del.textContent = "remove";
    del.addEventListener("click", async () => {
      await patchSettings({ macros: macros.filter((x) => x.name !== m.name) });
      renderMacros();
    });
    const label = document.createElement("code");
    label.textContent = "/" + m.name;
    row.append(label, document.createTextNode(" " + m.template.slice(0, 60) + " "), del);
    list.appendChild(row);
  }
}

$("#macro-add").addEventListener("click", async () => {
  const name = $("#macro-name").value.trim().replace(/^\//, "");
  const template = $("#macro-template").value.trim();
  if (!name || !template) return;
  const macros = (settingsCache.macros || []).filter((m) => m.name !== name);
  macros.push({ name, template });
  await patchSettings({ macros });
  $("#macro-name").value = "";
  $("#macro-template").value = "";
  renderMacros();
});

/* memory "dreaming" — on-demand and weekly rewrites of memory.md */

let memoryTaskSpec = null; // { marker, prompt } from the server

async function getMemoryTaskSpec() {
  if (!memoryTaskSpec) memoryTaskSpec = await fetch("/api/memory/optimize").then((r) => r.json());
  return memoryTaskSpec;
}

async function findMemoryTasks() {
  const [{ marker }, tasks] = await Promise.all([getMemoryTaskSpec(), fetch("/api/tasks").then((r) => r.json())]);
  return tasks.filter((t) => t.prompt.includes(marker));
}

async function refreshMemoryWeekly() {
  $("#set-memory-weekly").checked = (await findMemoryTasks()).length > 0;
}

$("#set-memory-weekly").addEventListener("change", async (e) => {
  const box = e.target;
  box.disabled = true;
  const existing = await findMemoryTasks();
  if (box.checked) {
    if (!existing.length) {
      const { prompt } = await getMemoryTaskSpec();
      await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, schedule: { type: "weekly", weekday: 0, time: "05:00" } }),
      });
    }
  } else {
    for (const t of existing) await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
  }
  box.disabled = false;
  refreshMemoryWeekly();
});

$("#memory-optimize").addEventListener("click", async () => {
  const btn = $("#memory-optimize");
  const status = $("#memory-optimize-status");
  btn.disabled = true;
  btn.textContent = "Optimizing…";
  status.textContent = "Rewriting memory.md — this can take a minute.";
  try {
    const res = await fetch("/api/memory/optimize", { method: "POST" }).then((r) => r.json());
    if (res.error) {
      status.textContent = "Failed: " + res.error;
    } else {
      $("#set-memory").value = res.memory || "";
      status.textContent = res.summary;
    }
  } catch (err) {
    status.textContent = "Failed: " + err.message;
  }
  btn.disabled = false;
  btn.textContent = "Optimize memory";
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
        maxTurnMinutes: Number($("#set-max-minutes").value) || 0,
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
  if (currentMode === "heavy") return "heavy"; // heavy runs its own plan phase
  return skipPlanCheck.checked ? `${currentMode}-exec` : currentMode;
}

function updateModeUI() {
  const labels = { "": "Research", wide: "Research: Wide", deep: "Research: Deep", heavy: "Research: Heavy" };
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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtWhen(ts) {
  return ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

function scheduleLabel(s) {
  switch (s?.type) {
    case "daily": return `every day at ${s.time}`;
    case "weekly": return `every ${WEEKDAYS[Number(s.weekday ?? 1)] || "Monday"} at ${s.time}`;
    case "interval": return `every ${Math.max(5, Number(s.minutes) || 60)} minutes`;
    case "once": return `once, at ${fmtWhen(new Date(s.at).getTime())}`;
    default: return "on an unknown schedule";
  }
}

// datetime-local wants a local (not UTC) "YYYY-MM-DDTHH:MM" string
function localDateTimeValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

/* ---------------- skills ---------------- */

let editingSkill = null;

async function refreshSkills() {
  const skills = await fetch("/api/skills").then((r) => r.json());
  const list = $("#skill-list");
  list.innerHTML = skills.length
    ? ""
    : '<div class="mcp-note">No skills yet. MockChatGPT teaches itself reusable playbooks as you work — they\'ll appear here. You can edit or delete them.</div>';
  for (const s of skills) {
    const row = document.createElement("div");
    row.className = "skill-row";
    const grow = document.createElement("div");
    grow.className = "grow";
    grow.innerHTML = `<div></div><div class="meta"></div>`;
    grow.children[0].textContent = s.title || s.slug;
    grow.children[1].textContent = s.description || s.slug;
    row.appendChild(grow);
    const mk = (label, fn, danger) => {
      const b = document.createElement("button");
      b.className = "mini-btn" + (danger ? " danger" : "");
      b.textContent = label;
      b.addEventListener("click", fn);
      row.appendChild(b);
    };
    mk("View / edit", () => openSkill(s.slug));
    mk("Delete", async () => {
      if (!confirm(`Delete the skill "${s.slug}"? MockChatGPT will lose this playbook.`)) return;
      await fetch(`/api/skills/${s.slug}`, { method: "DELETE" });
      if (editingSkill === s.slug) closeSkillEditor();
      refreshSkills();
    }, true);
    list.appendChild(row);
  }
}

async function openSkill(slug) {
  const data = await fetch(`/api/skills/${slug}`).then((r) => r.json());
  if (data.error) return alert(data.error);
  editingSkill = slug;
  $("#skill-editor-title").textContent = `${slug}.md`;
  $("#skill-content").value = data.content;
  $("#skill-status").textContent = "";
  $("#skill-editor").hidden = false;
}

function closeSkillEditor() {
  editingSkill = null;
  $("#skill-editor").hidden = true;
}

$("#skills-btn").addEventListener("click", () => {
  $("#skills-backdrop").hidden = false;
  closeSkillEditor();
  refreshSkills();
});
$("#skill-save").addEventListener("click", async () => {
  if (!editingSkill) return;
  const res = await fetch(`/api/skills/${editingSkill}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: $("#skill-content").value }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  $("#skill-status").textContent = "Saved ✓";
  refreshSkills();
});
$("#skill-cancel").addEventListener("click", closeSkillEditor);


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
    postUserTurn({
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

// approval card rendered when the agent proposes a scheduled task in chat
function buildTaskCreateCard(jsonText) {
  let spec;
  try {
    spec = JSON.parse(jsonText.trim());
  } catch {
    return null;
  }
  const type = spec?.schedule?.type;
  if (!spec?.prompt || !["daily", "weekly", "interval", "once"].includes(type)) return null;

  const card = document.createElement("div");
  card.className = "mcp-card";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "⏰ Scheduled task proposal";
  const reason = document.createElement("div");
  reason.textContent = spec.reason || "";
  const prompt = document.createElement("div");
  prompt.className = "cmd";
  prompt.textContent = spec.prompt;
  card.append(title, reason, prompt);

  // the one part of the schedule worth tweaking before approving
  const when = document.createElement("div");
  when.className = "when";
  const label = document.createElement("span");
  const field = document.createElement("input");
  const unit = document.createElement("span");
  if (type === "interval") {
    label.textContent = "Every";
    field.type = "number";
    field.min = "5";
    field.style.width = "80px";
    field.value = String(Math.max(5, Number(spec.schedule.minutes) || 60));
    unit.textContent = "minutes";
  } else if (type === "once") {
    label.textContent = "Once, at";
    field.type = "datetime-local";
    const at = new Date(spec.schedule.at);
    field.value = isNaN(at.getTime()) ? "" : localDateTimeValue(at);
  } else {
    label.textContent = type === "weekly" ? `Every ${WEEKDAYS[Number(spec.schedule.weekday ?? 1)] || "Monday"} at` : "Every day at";
    field.type = "time";
    field.value = /^\d{1,2}:\d{2}$/.test(spec.schedule.time || "") ? spec.schedule.time : "09:00";
  }
  when.append(label, field, unit);
  card.appendChild(when);

  const actions = document.createElement("div");
  actions.className = "actions";
  const approve = document.createElement("button");
  approve.className = "primary";
  approve.textContent = "Approve & schedule";
  const status = document.createElement("div");
  status.className = "status";
  approve.addEventListener("click", async () => {
    const schedule = { type };
    if (type === "interval") {
      schedule.minutes = Math.max(5, Number(field.value) || 60);
    } else if (type === "once") {
      if (!field.value) return void (status.textContent = "Pick a date and time first.");
      schedule.at = new Date(field.value).toISOString();
    } else {
      schedule.time = field.value;
      if (type === "weekly") schedule.weekday = Number(spec.schedule.weekday ?? 1);
    }
    approve.disabled = true;
    status.textContent = "Scheduling…";
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: spec.prompt, schedule }),
    }).then((r) => r.json());
    if (res.error) {
      status.textContent = "Failed: " + res.error;
      approve.disabled = false;
      return;
    }
    status.textContent = `Scheduled ✓ — ${scheduleLabel(res.schedule)}, first run ${fmtWhen(res.nextRun)}. Manage it under "Scheduled tasks".`;
    loadConversations();
  });
  actions.appendChild(approve);
  card.append(actions, status);
  return card;
}

/* ---------------- activity & usage dashboard ---------------- */

$("#activity-btn").addEventListener("click", async () => {
  $("#activity-backdrop").hidden = false;
  $("#usage-summary").textContent = "Loading…";
  const [usage, feed] = await Promise.all([
    fetch("/api/usage?days=30").then((r) => r.json()),
    fetch("/api/activity?days=7").then((r) => r.json()),
  ]);
  const t = usage.totals;
  $("#usage-summary").textContent =
    `Last 30 days: ${t.turns} turns · ${fmtTok(t.input)} in / ${fmtTok(t.output)} out tokens` +
    (t.cached ? ` (${fmtTok(t.cached)} cached)` : "") +
    ` · models: ${Object.entries(usage.byModel).map(([m, v]) => `${m} ${v.turns}`).join(", ") || "—"}`;
  // 14-day bar chart, pure divs
  const chart = $("#usage-chart");
  chart.innerHTML = "";
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const max = Math.max(1, ...days.map((d) => (usage.byDay[d]?.output || 0) + (usage.byDay[d]?.input || 0)));
  for (const d of days) {
    const v = (usage.byDay[d]?.input || 0) + (usage.byDay[d]?.output || 0);
    const col = document.createElement("div");
    col.className = "u-col";
    col.title = `${d}: ${fmtTok(v)} tokens, ${usage.byDay[d]?.turns || 0} turns`;
    const bar = document.createElement("div");
    bar.className = "u-bar";
    bar.style.height = Math.round((v / max) * 60) + "px";
    const lbl = document.createElement("div");
    lbl.className = "u-lbl";
    lbl.textContent = d.slice(8);
    col.append(bar, lbl);
    chart.appendChild(col);
  }
  // feed
  const feedEl = $("#activity-feed");
  feedEl.innerHTML = feed.length ? "" : '<div class="mcp-note">No agent activity in the last 7 days.</div>';
  let lastDay = "";
  const KIND_LABELS = { command: "cmd", search: "search", file: "file", browse: "browse", reasoning: "think", plan: "plan", tool: "tool", error: "err" };
  for (const e of feed) {
    const day = new Date(e.ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (day !== lastDay) {
      const h = document.createElement("div");
      h.className = "conv-group-label";
      h.textContent = day;
      feedEl.appendChild(h);
      lastDay = day;
    }
    const row = document.createElement("div");
    row.className = "task-row";
    row.style.cursor = "pointer";
    const grow = document.createElement("div");
    grow.className = "grow";
    grow.innerHTML = `<div class="t-prompt"></div><div class="meta"></div>`;
    grow.querySelector(".t-prompt").textContent = (e.scheduled ? "⏰ " : "") + e.title;
    const kinds = Object.entries(e.kinds).map(([k, n]) => `${n} ${KIND_LABELS[k] || k}`).join(" · ");
    grow.querySelector(".meta").textContent =
      `${new Date(e.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${fmtDuration(e.durationMs)}` +
      (kinds ? ` · ${kinds}` : "") + fmtUsage(e.usage) + (e.stopped ? " · stopped" : "") +
      (e.files.length ? ` · touched: ${e.files.join(", ").slice(0, 80)}` : "");
    row.appendChild(grow);
    row.addEventListener("click", () => {
      $("#activity-backdrop").hidden = true;
      openConversation(e.conversationId);
    });
    feedEl.appendChild(row);
  }
});

/* ---------------- slash macros in the composer ---------------- */

const macroMenu = document.createElement("div");
macroMenu.id = "macro-menu";
macroMenu.hidden = true;
// clicks inside the menu must not reach the document-level close handler —
// selecting a macro swaps the menu's children, which detaches e.target and
// makes contains() checks fail
macroMenu.addEventListener("click", (e) => e.stopPropagation());
$("#composer").style.position = "relative";
$("#composer").appendChild(macroMenu);

function composerMacros() {
  return currentSettings.macros || settingsCache.macros || [];
}

function updateMacroMenu() {
  const match = promptInput.value.match(/^\/(\w*)$/);
  const macros = match ? composerMacros().filter((m) => m.name.startsWith(match[1])) : [];
  if (!match || !macros.length) {
    macroMenu.hidden = true;
    return;
  }
  macroMenu.innerHTML = "";
  macros.slice(0, 8).forEach((m, i) => {
    const b = document.createElement("button");
    b.className = "menu-item" + (i === 0 ? " selected" : "");
    b.innerHTML = `<span></span><span class="menu-desc"></span>`;
    b.children[0].textContent = "/" + m.name;
    b.children[1].textContent = m.template.slice(0, 44);
    b.addEventListener("click", () => applyMacro(m));
    macroMenu.appendChild(b);
  });
  macroMenu.hidden = false;
}

function applyMacro(m) {
  macroMenu.hidden = true;
  const vars = [...new Set([...m.template.matchAll(/\{\{(.+?)\}\}/g)].map((x) => x[1].trim()))];
  if (!vars.length) {
    promptInput.value = m.template;
    autogrow();
    promptInput.focus();
    promptInput.dispatchEvent(new Event("input"));
    return;
  }
  // fill-in form for {{vars}}
  macroMenu.innerHTML = "";
  const inputs = {};
  for (const v of vars) {
    const row = document.createElement("div");
    row.className = "env-row";
    const label = document.createElement("code");
    label.textContent = v;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = v;
    inputs[v] = input;
    row.append(label, input);
    macroMenu.appendChild(row);
  }
  const insert = document.createElement("button");
  insert.className = "primary";
  insert.textContent = "Insert";
  insert.style.margin = "6px";
  insert.addEventListener("click", () => {
    let text = m.template;
    for (const v of vars) text = text.replaceAll(`{{${v}}}`, inputs[v].value.trim() || v);
    // also handle templates written with inner spacing like {{ var }}
    text = text.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, name) => inputs[name.trim()]?.value.trim() || name.trim());
    macroMenu.hidden = true;
    promptInput.value = text;
    autogrow();
    promptInput.focus();
    promptInput.dispatchEvent(new Event("input"));
  });
  macroMenu.appendChild(insert);
  macroMenu.hidden = false;
  Object.values(inputs)[0].focus();
}

promptInput.addEventListener("input", updateMacroMenu);
document.addEventListener("click", (e) => {
  if (!macroMenu.contains(e.target) && e.target !== promptInput) macroMenu.hidden = true;
});

/* ---------------- generic modal close ---------------- */

document.querySelectorAll(".modal-x[data-close]").forEach((b) =>
  b.addEventListener("click", () => (document.getElementById(b.dataset.close).hidden = true)));
document.querySelectorAll(".backdrop").forEach((bd) =>
  bd.addEventListener("click", (e) => {
    if (e.target === bd) bd.hidden = true;
  }));

/* ---------------- desktop notifications ---------------- */

const TASK_PREFIX = "⏰";
let notifyAsked = false;
let taskStamps = null; // id → updatedAt for task chats; null until the first load

// Asked on the first send rather than at load, so the prompt has context.
function ensureNotifyPermission() {
  if (notifyAsked || !("Notification" in window)) return;
  notifyAsked = true;
  if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function notify(title, body, convId) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  let n;
  try {
    n = new Notification(title, { body, tag: convId || "mockchatgpt" });
  } catch {
    return; // some browsers only allow notifications from a service worker
  }
  n.addEventListener("click", () => {
    window.focus();
    n.close();
    if (convId) openConversation(convId);
  });
}

// Scheduled runs land server-side with no stream attached, so they are spotted
// by watching the updatedAt of "⏰" chats across conversation-list refreshes.
function detectTaskRuns() {
  const stamps = new Map();
  for (const c of conversations) {
    if (c.title.startsWith(TASK_PREFIX)) stamps.set(c.id, c.updatedAt);
  }
  if (taskStamps) {
    for (const [id, updatedAt] of stamps) {
      const prev = taskStamps.get(id);
      if (prev !== undefined && updatedAt <= prev) continue;
      if (id === streamConvId) continue; // our own turn, not a scheduled run
      if (!document.hidden && currentConv?.id === id) continue; // already looking at it
      notify("Scheduled task finished", conversations.find((c) => c.id === id).title, id);
    }
  }
  taskStamps = stamps;
}

setInterval(() => {
  if (document.hidden && !streaming) loadConversations();
}, 60000);

/* ---------------- misc ---------------- */

$("#new-chat-btn").addEventListener("click", newChat);
$("#sidebar-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("hidden"));
searchInput.addEventListener("input", renderConvList);

newChat();
loadConversations();
loadModelSettings();
loadProjects();
updateModeUI();
