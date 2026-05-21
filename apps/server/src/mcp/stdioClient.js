import { spawn } from "node:child_process";

/**
 * Minimal MCP-over-stdio JSON-RPC client.
 * - Spawns an MCP server process
 * - Performs initialize handshake
 * - Supports tools/list + tools/call
 *
 * This is intentionally dependency-free.
 */

function splitCommand(cmd) {
  // Very small parser: supports quoted segments with "..."
  // Example:  node "./path with spaces/server.js" --foo bar
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export class McpStdioClient {
  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  #proc = null;
  #nextId = 1;
  /** @type {Map<number, { resolve: Function, reject: Function }>} */
  #pending = new Map();
  #buffer = "";
  #initialized = false;

  /**
   * @param {{ name: string, command: string, env?: Record<string,string> }} cfg
   */
  constructor(cfg) {
    this.name = cfg.name;
    this.command = cfg.command;
    this.env = cfg.env ?? {};
  }

  async start() {
    if (this.#proc) return;
    if (!this.command?.trim()) throw new Error(`[mcp:${this.name}] missing command`);

    const parts = splitCommand(this.command);
    let bin = parts[0];
    const args = parts.slice(1);

    // Windows: executables like npx are usually npx.cmd
    if (process.platform === "win32") {
      if (bin === "npx") bin = "npx.cmd";
      if (bin === "npm") bin = "npm.cmd";
      if (bin === "node") bin = "node.exe";
    }

    this.#proc = spawn(bin, args, {
      stdio: "pipe",
      env: { ...process.env, ...this.env },
    });

    this.#proc.on("error", (err) => {
      const e = new Error(`[mcp:${this.name}] spawn failed: ${err?.message ?? String(err)}`);
      for (const { reject } of this.#pending.values()) reject(e);
      this.#pending.clear();
      this.#proc = null;
      this.#initialized = false;
    });

    this.#proc.stdout.setEncoding("utf8");
    this.#proc.stdout.on("data", (chunk) => this.#onStdout(chunk));
    this.#proc.stderr.setEncoding("utf8");
    this.#proc.stderr.on("data", (chunk) => {
      // Keep stderr for debugging; do not crash unless process exits.
      // eslint-disable-next-line no-console
      console.warn(`[mcp:${this.name}] stderr: ${String(chunk).trim()}`);
    });

    this.#proc.on("exit", (code, signal) => {
      const err = new Error(`[mcp:${this.name}] exited code=${code} signal=${signal}`);
      for (const { reject } of this.#pending.values()) reject(err);
      this.#pending.clear();
      this.#proc = null;
      this.#initialized = false;
    });

    await this.initialize();
  }

  async initialize() {
    if (this.#initialized) return;
    const result = await this.#request("initialize", {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "swiggy-assistant-api", version: "0.0.1" },
      capabilities: {},
    });
    // Some servers expect a follow-up "initialized" notification.
    await this.#notify("initialized", {});
    this.#initialized = true;
    return result;
  }

  async listTools() {
    await this.start();
    const res = await this.#request("tools/list", {});
    return res;
  }

  async callTool(name, args = {}) {
    await this.start();
    const res = await this.#request("tools/call", { name, arguments: args });
    return res;
  }

  async listResources() {
    await this.start();
    const res = await this.#request("resources/list", {});
    return res;
  }

  async readResource(uri) {
    await this.start();
    const res = await this.#request("resources/read", { uri });
    return res;
  }

  async close() {
    if (!this.#proc) return;
    this.#proc.kill();
    this.#proc = null;
    this.#initialized = false;
  }

  async #notify(method, params) {
    if (!this.#proc) throw new Error(`[mcp:${this.name}] not started`);
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.#proc.stdin.write(msg);
  }

  async #request(method, params) {
    if (!this.#proc) throw new Error(`[mcp:${this.name}] not started`);
    const id = this.#nextId++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    const p = new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    this.#proc.stdin.write(msg);
    return await p;
  }

  #onStdout(chunk) {
    this.#buffer += chunk;
    while (true) {
      const idx = this.#buffer.indexOf("\n");
      if (idx < 0) return;
      const line = this.#buffer.slice(0, idx).trim();
      this.#buffer = this.#buffer.slice(idx + 1);
      if (!line) continue;

      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        // eslint-disable-next-line no-console
        console.warn(`[mcp:${this.name}] non-json line: ${line}`);
        continue;
      }

      if (typeof msg?.id === "number" && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error?.message ?? "MCP error"));
        else resolve(msg.result);
      }
    }
  }

  name;
  command;
  env;
}

