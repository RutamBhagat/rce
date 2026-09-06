import type { McpServer } from "@modelcontextprotocol/server";
import type { CodexAppServerService } from "../services/codex-app-server.ts";
import type { ProcessManager } from "../services/process-manager.ts";

export type ToolContext = {
  root: string;
  codex: CodexAppServerService;
  processes?: ProcessManager;
};

export type ToolPlugin = {
  register(server: McpServer, context: ToolContext): void;
  available?(context: ToolContext): boolean;
};
