import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerToolResultApp } from "./mcp-app.ts";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    pi: await PiService.create(root),
    skills: await SkillService.create(root),
    processes: ProcessManager.create(root, origin),
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: "0.1.0" }, {
      instructions: "Prefer the direct Pi-backed tools for regular filesystem and shell work, and prefer process_* for persistent or interactive commands through Herdr. Use read_many for efficient batched/ranged reads and apply_patch for structured multi-file edits. MCP tools discovered from the local Codex CLI are exposed directly through Pi; call those tools normally when a task requires them. Do not use the MCP gateway tool when an equivalent direct tool is available.",
    });
    registerToolResultApp(server);
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
