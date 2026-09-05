import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { ROOT } from "./root.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

const context: ToolContext = {
  root: ROOT,
  pi: new PiService(ROOT),
  processes: ProcessManager.create(ROOT),
};

export const mcp = createMcpHandler(() => {
  const server = new McpServer({ name: "rce", version: "0.1.0" });
  registerTools(server, context);
  return server;
}, { legacy: "reject" });
