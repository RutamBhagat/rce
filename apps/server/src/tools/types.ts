import type { McpServer } from "@modelcontextprotocol/server";
import type { PiService } from "../services/pi.ts";
import type { ProcessManager } from "../services/process-manager.ts";

export type ToolContext = {
  root: string;
  pi: PiService;
  processes?: ProcessManager;
};

export type ToolPlugin = {
  register(server: McpServer, context: ToolContext): void;
  available?(context: ToolContext): boolean;
};
