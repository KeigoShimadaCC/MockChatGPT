import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./store.js";

const APP_INSTALLED_FILE = path.join(DATA_DIR, "mcp-app-installed.json");

function codexMcp(args) {
  return new Promise((resolve, reject) => {
    execFile("codex", ["mcp", ...args], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

function appInstalled() {
  try {
    return JSON.parse(fs.readFileSync(APP_INSTALLED_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveAppInstalled(list) {
  fs.writeFileSync(APP_INSTALLED_FILE, JSON.stringify(list, null, 2));
}

// Curated keyless/free picks from docs/03-mcp-options.md
export const CATALOG = [
  {
    id: "playwright",
    title: "Playwright (browser automation)",
    description: "Let the agent drive a real browser: open pages, click, fill forms, screenshot.",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--headless", "--isolated"],
    needs: null,
  },
  {
    id: "chrome-devtools",
    title: "Chrome DevTools",
    description: "Debug live pages: console logs, network requests, performance traces.",
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest"],
    needs: null,
  },
  {
    id: "context7",
    title: "Context7 (library docs)",
    description: "Up-to-date documentation lookup for any library or framework.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    needs: null,
  },
  {
    id: "memory",
    title: "Knowledge graph memory",
    description: "Official MCP memory server — entity/relation knowledge graph the agent can grow.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    needs: null,
  },
  {
    id: "fetch",
    title: "Fetch (URL → markdown)",
    description: "Fetch any URL and convert it to clean markdown for the agent to read.",
    command: "uvx",
    args: ["mcp-server-fetch"],
    needs: "uv",
  },
  {
    id: "duckduckgo",
    title: "DuckDuckGo search",
    description: "Keyless extra web search + page fetching (complements built-in search).",
    command: "uvx",
    args: ["duckduckgo-mcp-server"],
    needs: "uv",
  },
  {
    id: "markitdown",
    title: "MarkItDown (documents)",
    description: "Microsoft's converter: 29+ file formats (PDF, Office, images) to markdown.",
    command: "uvx",
    args: ["markitdown-mcp"],
    needs: "uv",
  },
  {
    id: "hf-spaces",
    title: "Hugging Face Spaces (image gen)",
    description: "Call HF Spaces like FLUX.1-schnell for real diffusion image generation. Optional HF_TOKEN env raises limits.",
    command: "npx",
    args: ["-y", "@llmindset/mcp-hfspace", "black-forest-labs/FLUX.1-schnell"],
    needs: null,
    envKeys: ["HF_TOKEN (optional)"],
  },
];

function which(bin) {
  try {
    const paths = (process.env.PATH || "").split(path.delimiter);
    return paths.some((p) => {
      try {
        fs.accessSync(path.join(p, bin), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export async function listServers() {
  const raw = await codexMcp(["list", "--json"]);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  // codex may return an array or {servers: [...]} depending on version
  const servers = Array.isArray(parsed) ? parsed : parsed.servers || [];
  const app = appInstalled();
  return {
    servers: servers.map((s) => ({
      name: s.name,
      command: s.command || s.url || "",
      args: s.args || [],
      enabled: s.enabled !== false,
      appInstalled: app.includes(s.name),
    })),
    catalog: CATALOG.map((c) => ({
      ...c,
      available: c.needs ? which(c.needs) : true,
      installed: servers.some((s) => s.name === c.id),
    })),
    uvAvailable: which("uvx"),
  };
}

export async function installServer({ name, command, args = [], env = {}, url }) {
  if (!/^[\w-]{1,40}$/.test(name || "")) throw new Error("invalid server name");
  const cli = ["add", name];
  if (url) {
    cli.push("--url", url);
  } else {
    if (!command) throw new Error("command required");
    for (const [k, v] of Object.entries(env)) {
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(k)) throw new Error(`invalid env key ${k}`);
      cli.push("--env", `${k}=${v}`);
    }
    cli.push("--", command, ...args);
  }
  await codexMcp(cli);
  const app = appInstalled();
  if (!app.includes(name)) saveAppInstalled([...app, name]);
  return { ok: true };
}

export async function removeServer(name) {
  if (!/^[\w-]{1,40}$/.test(name || "")) throw new Error("invalid server name");
  await codexMcp(["remove", name]);
  saveAppInstalled(appInstalled().filter((n) => n !== name));
  return { ok: true };
}
