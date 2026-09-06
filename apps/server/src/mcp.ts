import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    pi: new PiService(root),
    skills: await SkillService.create(root),
    processes: ProcessManager.create(root, origin),
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: "0.1.0" });
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
