import type { McpServer } from "@modelcontextprotocol/server";
import type { CodexAppServerService } from "../services/codex-app-server.ts";
import type { PiService } from "../services/pi.ts";
import type { ProcessManager } from "../services/process-manager.ts";
import type { SkillService } from "../services/skills.ts";

export type ToolContext = {
  root: string;
  codex: CodexAppServerService;
  pi: PiService;
  skills: SkillService;
  processes?: ProcessManager;
};

export type ToolPlugin = {
  register(server: McpServer, context: ToolContext): void;
  available?(context: ToolContext): boolean;
};
