import { getThread, runTurn } from "./codexClient.js";
import { claimAuditPrompt } from "./prompts.js";

// "Claim Audit" — per-claim verification of an answer the app already gave.
//
// The audit runs on a FRESH Codex thread in the same workspace: the thread that
// wrote the answer would re-read its own reasoning and agree with itself, so the
// fact-checker only ever sees the answer text. Its activity events are forwarded
// to the caller so the UI can show the searches as they happen.

const MAX_CLAIMS = 12;
const VERDICTS = new Set(["supported", "unverifiable", "contradicted"]);

// Returns { claims, finalText }. Throws when the fenced block can't be parsed.
export async function runClaimAudit(answer, emit, signal, deps = { getThread, runTurn }) {
  emit({
    type: "activity",
    id: "audit-start",
    kind: "plan",
    label: "Extracting claims",
    detail: "Pulling the load-bearing factual claims out of the answer, then searching for each one.",
    done: false,
  });
  const { finalText, aborted } = await deps.runTurn(
    deps.getThread(null),
    claimAuditPrompt(answer),
    emit,
    signal,
  );
  const claims = parseClaimAudit(finalText);
  emit({
    type: "activity",
    id: "audit-start",
    kind: "plan",
    label: claims ? `Checked ${claims.length} claims` : "Extracting claims",
    detail: (claims || []).map((c) => `${ICON[c.verdict]} ${c.claim}`).join("\n"),
    done: true,
  });
  if (!claims) {
    throw new Error(
      aborted
        ? "The audit was cancelled before it reported back."
        : "The fact-checker didn't return a readable claim-audit block.",
    );
  }
  return { claims, finalText };
}

const ICON = { supported: "✅", unverifiable: "⚠️", contradicted: "❌" };

// The verdict list arrives inside a ```claim-audit fence, but models drift on
// the tag and like to wrap the block in prose — fall back to any fenced array,
// then to a bare one. Returns null when nothing parses (the caller reports it as
// an error rather than storing an empty audit, which would read as "all clear").
export function parseClaimAudit(text) {
  if (!text) return null;
  const candidates = [];
  const tagged = text.match(/```claim-?audit\s*([\s\S]*?)```/i);
  if (tagged) candidates.push(tagged[1]);
  for (const [, body] of text.matchAll(/```[\w-]*\s*([\s\S]*?)```/g)) candidates.push(body);
  const bare = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (bare) candidates.push(bare[0]);

  for (const raw of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const claims = parsed.map(normalizeClaim).filter(Boolean).slice(0, MAX_CLAIMS);
    if (claims.length) return claims;
  }
  return null;
}

function normalizeClaim(raw) {
  if (!raw || typeof raw !== "object") return null;
  const claim = String(raw.claim ?? "").trim();
  if (!claim) return null;
  const verdict = String(raw.verdict ?? "").trim().toLowerCase();
  return {
    claim: claim.slice(0, 500),
    // An unrecognised verdict must not pass as a clean bill of health.
    verdict: VERDICTS.has(verdict) ? verdict : "unverifiable",
    source: httpUrl(raw.source),
    note: String(raw.note ?? "").trim().slice(0, 300),
  };
}

// Sources are model output rendered as links, so anything that isn't a plain
// http(s) URL is dropped rather than handed to the browser.
function httpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
