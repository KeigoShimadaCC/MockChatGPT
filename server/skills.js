import fs from "fs";
import path from "path";
import { SKILLS_DIR } from "./store.js";

const INDEX_FILE = path.join(SKILLS_DIR, "INDEX.md");

// Kept in one place: the index is regenerated from the skill files whenever a
// skill is saved or deleted through the API, so the format must stay stable.
const INDEX_HEADER = `# Skills index

<!--
One line per skill file in this folder, in the form:

  - <slug>: <when to use it>

Each skill lives in <slug>.md and starts with a title heading followed by a
"**When to use:**" line — that line is what gets copied here. Keep this index in
sync when you add or rewrite a skill; the app regenerates it from the files
whenever a skill is saved or deleted through the Skills panel.
-->
`;

function skillPath(slug) {
  if (!/^[a-z0-9-]+$/.test(slug || "")) throw new Error("bad slug");
  return path.join(SKILLS_DIR, `${slug}.md`);
}

function describe(text) {
  const title = (text.match(/^#+\s+(.+)$/m) || [])[1]?.trim() || "";
  const when = (text.match(/^\*\*When to use:\*\*\s*(.+)$/im) || [])[1]?.trim();
  if (when) return { title, when };
  // fall back to the first line of prose so half-written skills still list
  const prose = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("<!--"));
  return { title, when: prose || "" };
}

export function listSkills() {
  let files = [];
  try {
    files = fs.readdirSync(SKILLS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .map((f) => {
      const slug = f.slice(0, -3);
      try {
        const text = fs.readFileSync(path.join(SKILLS_DIR, f), "utf8");
        const { title, when } = describe(text);
        return { slug, title: title || slug, description: when, updatedAt: fs.statSync(path.join(SKILLS_DIR, f)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readSkill(slug) {
  const p = skillPath(slug);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function writeSkill(slug, content) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(skillPath(slug), String(content ?? ""));
  regenerateIndex();
  return listSkills().find((s) => s.slug === slug);
}

export function deleteSkill(slug) {
  const p = skillPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  regenerateIndex();
}

export function regenerateIndex() {
  const lines = listSkills()
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => `- ${s.slug}: ${s.description || s.title}`);
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, INDEX_HEADER + (lines.length ? "\n" + lines.join("\n") + "\n" : ""));
}

export function ensureIndex() {
  if (!fs.existsSync(INDEX_FILE)) regenerateIndex();
}
