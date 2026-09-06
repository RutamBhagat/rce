import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CodexAppServerService } from "./services/codex-app-server.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    codex: await CodexAppServerService.create(root),
    processes: ProcessManager.create(root, origin),
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: "0.1.0" }, {
      instructions: "Codex app-server is the primary control plane. Use codex_rpc for filesystem, commands, skills, plugins, MCP, browser/computer-use, and other runtime capabilities; use codex_protocol when a method or schema is unknown. Discover skills/list and plugin/installed when specialized capabilities may help, and use mcpServerStatus/list after thread/start for MCP-backed plugin tools. For search, use command/exec with rg for text and rg --files for files; fuzzyFileSearch is available for fuzzy filenames. Prefer read_many for batched/ranged reads, apply_patch for multi-file or structured incremental edits, and process_* for persistent or interactive commands. Connector-only app actions may be unavailable. RCE never uses Codex model inference.",
    });
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
