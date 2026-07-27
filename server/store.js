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
export const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
export const PROJECT_FILES_DIR = path.join(WORKSPACE, "projects");
export const SKILLS_DIR = path.join(WORKSPACE, "skills");

for (const dir of [DATA_DIR, CONV_DIR, WORKSPACE, UPLOADS_DIR, GENERATED_DIR, PROJECT_FILES_DIR, SKILLS_DIR]) {
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
        return { id: c.id, title: c.title, projectId: c.projectId || null, updatedAt: c.updatedAt, createdAt: c.createdAt };
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

export function createConversation(projectId = null) {
  const conv = {
    id: crypto.randomUUID(),
    title: "New chat",
    projectId,
    threadId: null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveConversation(conv);
}

/* ---------------- projects ---------------- */

export function listProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

export function createProject({ name, instructions = "" }) {
  const projects = listProjects();
  const project = { id: crypto.randomUUID(), name: String(name).trim().slice(0, 60), instructions, createdAt: Date.now() };
  if (!project.name) throw new Error("name required");
  projects.push(project);
  saveProjects(projects);
  fs.mkdirSync(path.join(PROJECT_FILES_DIR, project.id), { recursive: true });
  return project;
}

export function updateProject(id, patch) {
  const projects = listProjects();
  const p = projects.find((p) => p.id === id);
  if (!p) throw new Error("project not found");
  if (typeof patch.name === "string" && patch.name.trim()) p.name = patch.name.trim().slice(0, 60);
  if (typeof patch.instructions === "string") p.instructions = patch.instructions;
  saveProjects(projects);
  return p;
}

export function deleteProject(id) {
  saveProjects(listProjects().filter((p) => p.id !== id));
  // detach conversations (keep the chats themselves)
  for (const meta of listConversations()) {
    if (meta.projectId === id) {
      const c = getConversation(meta.id);
      c.projectId = null;
      saveConversation(c);
    }
  }
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id) || null;
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
    return { customInstructions: "", nickname: "", memoryEnabled: true, model: "", reasoningEffort: "" };
  }
}

export function writeSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}
