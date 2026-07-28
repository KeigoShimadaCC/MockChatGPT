import fs from "fs";
import path from "path";
import { DATA_DIR, getConversation, saveConversation, createConversation } from "./store.js";
import { buildPreamble } from "./prompts.js";
import { getThread, runTurn } from "./codexClient.js";
import { logUsage } from "./usage.js";

const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

export function listTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// schedule: {type:"interval",minutes} | {type:"daily",time:"HH:MM"} |
//           {type:"weekly",weekday:0-6,time:"HH:MM"} | {type:"once",at:ISO}
export function computeNextRun(schedule, from = Date.now()) {
  const d = new Date(from);
  switch (schedule.type) {
    case "interval":
      return from + Math.max(5, Number(schedule.minutes) || 60) * 60000;
    case "once":
      return new Date(schedule.at).getTime();
    case "daily":
    case "weekly": {
      const [h, m] = (schedule.time || "09:00").split(":").map(Number);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
      while (
        next.getTime() <= from ||
        (schedule.type === "weekly" && next.getDay() !== Number(schedule.weekday ?? 1))
      ) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }
    default:
      return from + 3600000;
  }
}

export function createTask({ prompt, schedule }) {
  const tasks = listTasks();
  const task = {
    id: crypto.randomUUID(),
    prompt: String(prompt || "").trim(),
    schedule,
    enabled: true,
    conversationId: null,
    lastRun: null,
    lastStatus: null,
    nextRun: computeNextRun(schedule),
    createdAt: Date.now(),
  };
  if (!task.prompt) throw new Error("prompt required");
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function updateTask(id, patch) {
  const tasks = listTasks();
  const t = tasks.find((t) => t.id === id);
  if (!t) throw new Error("task not found");
  Object.assign(t, patch);
  if (patch.schedule) t.nextRun = computeNextRun(t.schedule);
  saveTasks(tasks);
  return t;
}

export function deleteTask(id) {
  saveTasks(listTasks().filter((t) => t.id !== id));
}

let running = false;

export async function runTask(id) {
  const tasks = listTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error("task not found");

  let conv = task.conversationId && getConversation(task.conversationId);
  if (!conv) {
    conv = createConversation();
    conv.title = "⏰ " + task.prompt.slice(0, 44) + (task.prompt.length > 44 ? "…" : "");
    task.conversationId = conv.id;
  }
  const stamp = new Date().toLocaleString();
  conv.messages.push({ role: "user", text: `[Scheduled run — ${stamp}]\n${task.prompt}`, ts: Date.now() });
  saveConversation(conv);

  const activities = [];
  let usage = null;
  const emit = (ev) => {
    if (ev.type === "activity") {
      const existing = ev.id && activities.find((a) => a.id === ev.id && a.kind === ev.kind);
      if (existing) Object.assign(existing, ev);
      else activities.push({ ...ev });
    }
    if (ev.type === "usage" && ev.usage) {
      usage = usage || {};
      for (const [k, v] of Object.entries(ev.usage)) {
        if (typeof v === "number") usage[k] = (usage[k] || 0) + v;
      }
    }
  };

  const startedAt = Date.now();
  try {
    const isFirstTurn = !conv.threadId;
    const input = (isFirstTurn ? buildPreamble() + "\n\n" : "") +
      `[This is an automated scheduled task run at ${stamp}. Complete the task and report the result.]\n${task.prompt}`;
    const thread = getThread(conv.threadId);
    const { threadId, finalText } = await runTurn(thread, input, emit);
    conv.threadId = threadId || conv.threadId;
    conv.messages.push({
      role: "assistant",
      text: finalText,
      activities,
      durationMs: Date.now() - startedAt,
      ...(usage ? { usage } : {}),
      ts: Date.now(),
    });
    saveConversation(conv);
    if (usage) {
      logUsage({ ts: Date.now(), conversationId: conv.id, model: "scheduled", researchMode: "scheduled", durationMs: Date.now() - startedAt, ...usage });
    }
    updateTask(task.id, {
      conversationId: conv.id,
      lastRun: Date.now(),
      lastStatus: "ok",
      nextRun: task.schedule.type === "once" ? null : computeNextRun(task.schedule),
      enabled: task.schedule.type === "once" ? false : task.enabled,
    });
  } catch (err) {
    conv.messages.push({ role: "assistant", text: `⚠️ Scheduled run failed: ${err.message}`, ts: Date.now() });
    saveConversation(conv);
    updateTask(task.id, { conversationId: conv.id, lastRun: Date.now(), lastStatus: "error: " + err.message.slice(0, 120) });
  }
}

export function startScheduler() {
  setInterval(async () => {
    if (running) return;
    const due = listTasks().filter((t) => t.enabled && t.nextRun && t.nextRun <= Date.now());
    if (!due.length) return;
    running = true;
    try {
      for (const t of due) {
        // bump nextRun first so a crash can't cause a tight retry loop
        updateTask(t.id, { nextRun: t.schedule.type === "once" ? null : computeNextRun(t.schedule) });
        console.log(`[scheduler] running task: ${t.prompt.slice(0, 50)}`);
        await runTask(t.id);
      }
    } catch (e) {
      console.error("[scheduler]", e);
    } finally {
      running = false;
    }
  }, 30000);
}
