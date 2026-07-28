import fs from "fs";
import path from "path";
import { DATA_DIR, CONV_DIR, listConversations, getConversation } from "./store.js";
import { listTasks } from "./scheduler.js";

const USAGE_LOG = path.join(DATA_DIR, "usage-log.jsonl");

export function logUsage(entry) {
  try {
    fs.appendFileSync(USAGE_LOG, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("[usage]", e);
  }
}

// Aggregated token usage for the dashboard: per-day and per-model totals.
export function usageSummary(days = 30) {
  const since = Date.now() - days * 86400000;
  const byDay = {};
  const byModel = {};
  let totals = { turns: 0, input: 0, output: 0, reasoning: 0, cached: 0 };
  let lines = [];
  try {
    lines = fs.readFileSync(USAGE_LOG, "utf8").split("\n").filter(Boolean);
  } catch {}
  for (const line of lines) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.ts < since) continue;
    const day = new Date(e.ts).toISOString().slice(0, 10);
    const model = e.model || "default";
    const input = e.input_tokens || 0;
    const output = e.output_tokens || 0;
    byDay[day] = byDay[day] || { turns: 0, input: 0, output: 0 };
    byDay[day].turns++;
    byDay[day].input += input;
    byDay[day].output += output;
    byModel[model] = byModel[model] || { turns: 0, input: 0, output: 0 };
    byModel[model].turns++;
    byModel[model].input += input;
    byModel[model].output += output;
    totals.turns++;
    totals.input += input;
    totals.output += output;
    totals.reasoning += e.reasoning_output_tokens || 0;
    totals.cached += e.cached_input_tokens || 0;
  }
  return { totals, byDay, byModel, days };
}

// Cross-conversation audit feed: everything the agent did, newest first.
export function activityFeed(days = 7, limit = 200) {
  const since = Date.now() - days * 86400000;
  const tasksByConv = new Map(listTasks().filter((t) => t.conversationId).map((t) => [t.conversationId, t]));
  const events = [];
  for (const meta of listConversations()) {
    if (meta.updatedAt < since) continue;
    const conv = getConversation(meta.id);
    if (!conv) continue;
    for (const m of conv.messages) {
      if (m.role !== "assistant" || m.ts < since) continue;
      const acts = m.activities || [];
      if (!acts.length && !tasksByConv.has(conv.id)) continue;
      const kinds = {};
      const files = new Set();
      for (const a of acts) {
        kinds[a.kind] = (kinds[a.kind] || 0) + 1;
        if (a.kind === "file" && a.detail) a.detail.split(",").forEach((f) => files.add(f.trim()));
      }
      if (!Object.keys(kinds).length && !tasksByConv.has(conv.id)) continue;
      events.push({
        ts: m.ts,
        conversationId: conv.id,
        title: conv.title,
        scheduled: tasksByConv.has(conv.id),
        durationMs: m.durationMs || 0,
        stopped: !!m.stopped,
        usage: m.usage || null,
        kinds,
        files: [...files].slice(0, 8),
      });
    }
  }
  events.sort((a, b) => b.ts - a.ts);
  return events.slice(0, limit);
}
