import { Codex } from "@openai/codex-sdk";
import { WORKSPACE, readSettings } from "./store.js";

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
// `signal` (optional) cancels the turn: the SDK hands it to the spawn() that
// starts `codex exec`, so aborting kills the child process, not just this loop.
// Returns { threadId, finalText, aborted }.
export async function runTurn(thread, input, emit, signal) {
  const { events } = await thread.runStreamed(input, { signal });
  // Codex can emit several agent_message items per turn (progress notes + final
  // answer); accumulate them so earlier ones aren't overwritten.
  const parts = [];
  let partial = "";
  let finalText = "";
  const abort = { aborted: false };

  for await (const event of untilAborted(events, abort, signal)) {
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
          case "mcp_tool_call":
            emit({
              type: "activity",
              id,
              kind: "tool",
              label: `Using ${item.server}`,
              detail: item.tool,
              done,
            });
            break;
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

  return { threadId: thread.id, finalText, aborted: abort.aborted };
}

// Ends iteration quietly when the turn is aborted instead of throwing, so the
// caller can still keep whatever the agent had produced before the kill.
// Killing the child races the AbortError, so the stream may instead surface a
// plain "exited with signal SIGTERM" — `signal.aborted` is the reliable tell.
async function* untilAborted(events, state, signal) {
  try {
    yield* events;
  } catch (err) {
    if (!signal?.aborted && err?.name !== "AbortError" && err?.code !== "ABORT_ERR") throw err;
    state.aborted = true;
  }
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "\n… (truncated)" : s;
}
