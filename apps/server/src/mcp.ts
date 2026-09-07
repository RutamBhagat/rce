import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerToolResultApp } from "./mcp-app.ts";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";
import { VERSION } from "./version.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    pi: await PiService.create(root),
    skills: await SkillService.create(root),
    processes: ProcessManager.create(root, origin),
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: VERSION }, {
      instructions: "Use the core RCE filesystem, shell, patch, and process tools as needed for the user's task. Agent Skills are manual-only: call list_skills only when the user explicitly asks to list/discover skills, and call load_skill only when the user explicitly asks to load/use a named skill. Extension-backed tools discovered from the local Codex MCP configuration (including web search, Context7, browser/CUA, and other external MCP tools) are also manual-only: invoke them only when the user explicitly asks to use that tool, extension, service, or capability. Do not invoke skills or extension-backed tools proactively based only on relevance. Prefer process_* for persistent or interactive commands through Herdr, read_many for efficient batched/ranged reads, and apply_patch for structured multi-file edits. Do not use the MCP gateway tool when an equivalent direct tool is available.",
    });
    registerToolResultApp(server, origin);
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
