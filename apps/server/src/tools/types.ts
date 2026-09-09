import type { McpServer } from "@modelcontextprotocol/server";
import type { PiService } from "../services/pi.ts";
import type { ProcessManager } from "../services/process-manager.ts";
import type { SkillService } from "../services/skills.ts";

export type ToolContext = {
  root: string;
  pi: PiService;
  skills: SkillService;
  processes?: ProcessManager;
  setRoot(root: string): Promise<string>;
};

export type ToolPlugin = {
  register(server: McpServer, context: ToolContext): void;
  available?(context: ToolContext): boolean;
};
