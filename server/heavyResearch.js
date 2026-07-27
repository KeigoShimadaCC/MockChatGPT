import { startThread, runTurn } from "./codexClient.js";
import { researchProtocol } from "./prompts.js";

// "Research: Heavy" — an orchestrator/worker pass in the shape of Claude
// Research (see docs/05-deep-research-modes.md): the conversation's own thread
// plans and later synthesizes, while bounded sub-researchers run in parallel on
// throwaway threads that share the workspace.
//
// Phase 1 (plan)      — conversation thread decomposes the question.
// Phase 2 (workers)   — one fresh thread per sub-question, all concurrent.
// Phase 3 (synthesis) — conversation thread writes the single cited report.

const MAX_WORKERS = 4;
const MAX_SEARCHES_PER_WORKER = 6;
const PHASE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SUMMARY_CHARS = 12000;

// `deps` is a seam for tests: it swaps the two Codex entry points for fakes so
// the phase/failure/timeout logic can be exercised without spending a run.
export async function runHeavyResearch(thread, input, emit, question, deps = { startThread, runTurn }) {
  const plan = await runPlanPhase(thread, input, emit, deps);

  if (!plan.subQuestions.length) {
    emit({
      type: "activity",
      id: "heavy-plan",
      kind: "plan",
      label: "Decomposition failed — falling back to a wide sweep",
      detail: "No parseable subquestions block; running the single-agent wide protocol instead.",
      done: true,
    });
    return deps.runTurn(thread, researchProtocol("wide") + question, emit);
  }

  const reports = await runWorkerPhase(plan.subQuestions, question, emit, deps);
  return runSynthesisPhase(thread, question, reports, emit, deps);
}

// ---------- phase 1: plan ----------

async function runPlanPhase(thread, input, emit, deps) {
  emit({
    type: "activity",
    id: "heavy-plan",
    kind: "plan",
    label: "Decomposing question",
    detail: "Breaking the question into independent sub-questions for parallel research.",
    done: false,
  });

  // The plan turn's prose is scaffolding, not the answer — keep it out of the
  // message body and let only phase 3 write there.
  const { finalText } = await deps.runTurn(thread, input, silenceAssistantText(emit));
  const subQuestions = parseSubQuestions(finalText).slice(0, MAX_WORKERS);

  emit({
    type: "activity",
    id: "heavy-plan",
    kind: "plan",
    label: subQuestions.length
      ? `Planned ${subQuestions.length} parallel sub-researchers`
      : "Decomposing question",
    detail: subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    done: true,
  });
  return { subQuestions };
}

// Codex wraps the list in a ```subquestions fence; tolerate a bare JSON array
// too, since models drift on the fence tag.
export function parseSubQuestions(text) {
  if (!text) return [];
  const fenced = text.match(/```subquestions\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const anyArray = text.match(/\[\s*"[\s\S]*?"\s*\]/);
  if (anyArray) candidates.push(anyArray[0]);

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed)) {
        const qs = parsed.map((q) => String(q).trim()).filter(Boolean);
        if (qs.length) return qs;
      }
    } catch {
      // try the next candidate
    }
  }
  return [];
}

// ---------- phase 2: parallel workers ----------

async function runWorkerPhase(subQuestions, question, emit, deps) {
  const deadline = Date.now() + PHASE_TIMEOUT_MS;
  const results = await Promise.all(
    subQuestions.map((sub, idx) => runWorker(idx + 1, sub, question, subQuestions.length, emit, deadline, deps))
  );
  const ok = results.filter((r) => r.summary);
  emit({
    type: "activity",
    id: "heavy-workers",
    kind: "plan",
    label: `Sub-researchers finished (${ok.length}/${results.length} reported)`,
    detail: results
      .map((r) => `${r.index}. ${r.status === "ok" ? "✓" : "✗ " + r.status} ${r.subQuestion}`)
      .join("\n"),
    done: true,
  });
  return results;
}

async function runWorker(index, subQuestion, question, total, emit, deadline, deps) {
  const tag = `Sub-researcher ${index}`;
  const workerEmit = prefixWorkerEvents(emit, index, tag);
  emit({
    type: "activity",
    id: `sub${index}-start`,
    kind: "plan",
    label: `${tag}: starting`,
    detail: subQuestion,
    done: true,
  });

  const started = Date.now();
  try {
    const thread = deps.startThread();
    const { finalText } = await withDeadline(
      deps.runTurn(thread, workerPrompt(index, total, subQuestion, question), workerEmit),
      deadline
    );
    const summary = (finalText || "").trim();
    if (!summary) throw new Error("worker returned no summary");
    emit({
      type: "activity",
      id: `sub${index}-done`,
      kind: "plan",
      label: `${tag}: reported back (${Math.round((Date.now() - started) / 1000)}s)`,
      detail: subQuestion,
      done: true,
    });
    return { index, subQuestion, summary: summary.slice(0, MAX_SUMMARY_CHARS), status: "ok" };
  } catch (err) {
    // A dead worker must not take the run down: note it and let synthesis
    // proceed with whoever survived.
    const status = err?.name === "PhaseTimeout" ? "timed out" : "failed";
    emit({
      type: "activity",
      id: `sub${index}-done`,
      kind: "error",
      label: `${tag}: ${status} — skipped`,
      detail: `${subQuestion}\n${err?.message || err}`,
      done: true,
    });
    return { index, subQuestion, summary: "", status };
  }
}

function workerPrompt(index, total, subQuestion, question) {
  return `You are sub-researcher ${index} of ${total} on a research team. You work alone and autonomously — never ask questions or wait for input.

Research ONLY this sub-question:
${subQuestion}

(The team's overall question is "${question}" — context only. Do NOT try to answer it; another agent synthesizes the final report.)

Rules:
- Use at most ${MAX_SEARCHES_PER_WORKER} web searches. Make them count: distinct phrasings, prefer primary/official sources.
- Write nothing to shared files. The only file you may create or modify is notes/sub-${index}.md (mkdir -p notes first); everything else in the workspace is off-limits.
- Do not generate images, run long computations, or install anything.

Your FINAL message is the whole deliverable: a dense, citation-rich summary of what you found — concrete facts, numbers and dates, every claim carrying an inline markdown source link — ending with a one-line "Confidence & gaps" note. No preamble, no sign-off, no offers to do more.`;
}

// ---------- phase 3: synthesis ----------

async function runSynthesisPhase(thread, question, reports, emit, deps) {
  emit({
    type: "activity",
    id: "heavy-synth",
    kind: "plan",
    label: "Synthesizing",
    detail: "Merging sub-researcher reports into one cited answer.",
    done: false,
  });

  const survivors = reports.filter((r) => r.summary);
  if (!survivors.length) {
    emit({ type: "activity", id: "heavy-synth", kind: "error", label: "Synthesizing", detail: "Every sub-researcher failed; answering directly.", done: true });
  }

  const result = await deps.runTurn(thread, synthesisPrompt(question, reports), emit);
  emit({
    type: "activity",
    id: "heavy-synth",
    kind: "plan",
    label: "Synthesized final report",
    detail: `${survivors.length} sub-researcher report(s) merged.`,
    done: true,
  });
  return result;
}

function synthesisPrompt(question, reports) {
  const survivors = reports.filter((r) => r.summary);
  const failed = reports.filter((r) => !r.summary);

  let prompt = `Your sub-researchers report back. Their findings, verbatim:\n\n`;
  for (const r of survivors) {
    prompt += `<sub_researcher index="${r.index}" question=${JSON.stringify(r.subQuestion)}>\n${r.summary}\n</sub_researcher>\n\n`;
  }
  if (failed.length) {
    prompt += `These sub-questions produced no report (${failed.map((r) => r.status).join(", ")}) — treat them as coverage gaps and say so if they matter: ${failed
      .map((r) => JSON.stringify(r.subQuestion))
      .join("; ")}\n\n`;
  }
  if (!survivors.length) {
    prompt += `No sub-researcher succeeded. Answer from your own knowledge and a few searches of your own, and open by noting that the parallel research pass failed.\n\n`;
  }

  prompt += `Now write the final answer to the user's original question:
${question}

- Synthesize into ONE coherent report in a single narrative voice. Never mention sub-researchers, agents, or how the research was run — the user sees one assistant.
- Where the reports disagree, resolve the conflict explicitly: say which account the evidence favours and why, or state plainly that the sources conflict.
- Carry the source links through: every factual claim keeps an inline markdown link, and the report ends with a numbered Sources list.
- Structure: TL;DR, then sections that follow the substance (not one per sub-question), a comparison table where it helps, and a short "Open questions" close.
- Search again only if a load-bearing fact is missing from the reports.`;
  return prompt;
}

// ---------- event plumbing ----------

// Worker activities need ids of their own or the client's timeline (keyed by
// id, falling back to kind+detail) would collapse two workers running the same
// search into one row instead of showing parallel lanes.
function prefixWorkerEvents(emit, index, tag) {
  return (ev) => {
    if (ev.type === "activity") {
      // Namespace by worker, but keep the client's own fallback key inside the
      // namespace so a row still updates in place when Codex omits an item id.
      const key = ev.id || `${ev.kind}|${(ev.detail || ev.label || "").slice(0, 80)}`;
      emit({ ...ev, id: `sub${index}-${key}`, label: `${tag}: ${ev.label}` });
      return;
    }
    // Workers never write the message body, and their failures are reported as
    // activity rows by runWorker rather than as stream-level errors.
    if (ev.type === "assistant" || ev.type === "assistant_delta" || ev.type === "error") return;
    emit(ev);
  };
}

function silenceAssistantText(emit) {
  return (ev) => {
    if (ev.type === "assistant" || ev.type === "assistant_delta") return;
    emit(ev);
  };
}

export function withDeadline(promise, deadline) {
  const ms = Math.max(0, deadline - Date.now());
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`phase deadline of ${Math.round(PHASE_TIMEOUT_MS / 60000)} minutes reached`);
      err.name = "PhaseTimeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
