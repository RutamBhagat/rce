import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CodexAppServerService } from "./services/codex-app-server.ts";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    codex: await CodexAppServerService.create(root),
    pi: new PiService(root),
    skills: await SkillService.create(root),
    processes: ProcessManager.create(root, origin),
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: "0.1.0" }, {
      instructions: "Prefer the direct Pi-backed tools for regular filesystem and shell work, and prefer process_* for persistent or interactive commands through Herdr. Use read_many for efficient batched/ranged reads and apply_patch for structured multi-file edits. Only use the Codex app-server tools when the task requires capabilities exposed through Codex plugins/MCP or another Codex-only runtime surface. Do not route ordinary file, search, shell, or process work through codex_rpc. When Codex is required, use codex_protocol if the method/schema is unknown; discover plugin/installed and mcpServerStatus/list as needed. For Computer Use, start an ephemeral thread with approvalPolicy on-request, then call cua_repl through mcpServer/tool/call with synthetic x-codex-turn-metadata. Do not use approvalPolicy never for Computer Use because it rejects required app approvals. If codex_rpc returns a pending mcpServer/elicitation/request, answer it with codex_respond and resume the returned handle. Prefer session-scoped approval persistence unless the user requests a durable approval. RCE never uses Codex model inference.",
    });
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
