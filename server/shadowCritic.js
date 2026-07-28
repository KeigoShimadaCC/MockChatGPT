import { startThread, runTurn } from "./codexClient.js";

// "Shadow Critic" — an observer model that reviews each finished answer and
// posts a compact note beneath it (roadmap proposal #8, after Msty's Shadow
// Personas). It never participates in the conversation: the critique runs on a
// throwaway thread with its own cheap configuration, so it can't touch the
// conversation's Codex thread and doesn't inherit the user's model/effort.

const CRITIC_OVERRIDES = { model: "gpt-5.6-sol", modelReasoningEffort: "low" };
const TIMEOUT_MS = 90 * 1000;
// Below this, an answer is a greeting or a one-liner — nothing worth reviewing.
const MIN_ANSWER_CHARS = 200;
const MAX_EXCERPT_CHARS = 12000;
// Research modes already do their own verification pass and cost enough as it
// is; "-exec" is the same mode after plan approval.
const RESEARCH_MODE_RE = /^(wide|deep|heavy)(-exec)?$/;
// The exact string the reviewer is told to return when it finds nothing.
const OK_RE = /^lgtm\.?$/i;

export function shouldCritique({ enabled, researchMode, answer, stopped }) {
  if (!enabled || stopped) return false;
  if (RESEARCH_MODE_RE.test(researchMode || "")) return false;
  return (answer || "").trim().length >= MIN_ANSWER_CHARS;
}

const criticPrompt = (question, answer) =>
  `You are a silent quality reviewer. Here is a user question and an assistant's answer. In at most 3 terse bullets, flag only REAL issues: factual errors, logical flaws, or a part of the question that went unanswered. If the answer is solid, reply exactly: LGTM. Do not praise, do not pad, do not use tools other than (optionally) one quick web search for a fact you doubt.

<user_question>
${excerpt(question)}
</user_question>

<assistant_answer>
${excerpt(answer)}
</assistant_answer>`;

// Returns { ok: true } when the reviewer found nothing, { text } when it did,
// or null when the critique timed out or failed — the caller then emits nothing
// so a broken critic can never degrade the turn itself.
// `onUsage` receives the critique's token usage, kept apart from the turn's own.
// `signal` (the turn's own) lets /stop cut the review short as well.
export async function runCritique(question, answer, onUsage = () => {}, signal) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  const emit = (ev) => {
    if (ev.type === "usage" && ev.usage) onUsage(ev.usage);
  };
  let timer;
  try {
    const critique = runTurn(
      startThread(CRITIC_OVERRIDES),
      criticPrompt(question, answer),
      emit,
      controller.signal,
    );
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    });
    const result = await Promise.race([critique, timeout]);
    if (!result) {
      // Kill the codex child rather than leaving it running past the turn.
      controller.abort();
      console.warn(`[critic] timed out after ${TIMEOUT_MS / 1000}s — skipped`);
      return null;
    }
    const text = (result.finalText || "").trim();
    if (result.aborted || !text) return null;
    return OK_RE.test(text) ? { ok: true } : { text };
  } catch (err) {
    console.error("[critic]", err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

function excerpt(s) {
  const t = String(s || "").trim();
  return t.length > MAX_EXCERPT_CHARS ? t.slice(0, MAX_EXCERPT_CHARS) + "\n… (truncated)" : t;
}
