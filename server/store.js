import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const CONV_DIR = path.join(DATA_DIR, "conversations");
export const WORKSPACE = path.join(ROOT, "workspace");
export const UPLOADS_DIR = path.join(WORKSPACE, "uploads");
export const GENERATED_DIR = path.join(WORKSPACE, "generated");
export const MEMORY_FILE = path.join(WORKSPACE, "memory.md");
export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

for (const dir of [DATA_DIR, CONV_DIR, WORKSPACE, UPLOADS_DIR, GENERATED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function convPath(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error("bad id");
  return path.join(CONV_DIR, `${id}.json`);
}

export function listConversations() {
  return fs
    .readdirSync(CONV_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(CONV_DIR, f), "utf8"));
        return { id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id) {
  const p = convPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function saveConversation(conv) {
  conv.updatedAt = Date.now();
  fs.writeFileSync(convPath(conv.id), JSON.stringify(conv, null, 2));
  return conv;
}

export function createConversation() {
  const conv = {
    id: crypto.randomUUID(),
    title: "New chat",
    threadId: null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveConversation(conv);
}

export function deleteConversation(id) {
  const p = convPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function readMemory() {
  try {
    return fs.readFileSync(MEMORY_FILE, "utf8");
  } catch {
    return "";
  }
}

export function writeMemory(text) {
  fs.writeFileSync(MEMORY_FILE, text);
}

export function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { customInstructions: "", nickname: "", memoryEnabled: true };
  }
}

export function writeSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}
