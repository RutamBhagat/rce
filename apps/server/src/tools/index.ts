import type { McpServer } from "@modelcontextprotocol/server";
import { applyPatchTool } from "./apply-patch.ts";
import { bashTool } from "./bash.ts";
import { findTool } from "./find.ts";
import { grepTool } from "./grep.ts";
import { listSkillsTool } from "./list-skills.ts";
import { loadSkillTool } from "./load-skill.ts";
import { lsTool } from "./ls.ts";
import { processInfoTool } from "./process-info.ts";
import { processReadTool } from "./process-read.ts";
import { processSendTool } from "./process-send.ts";
import { processStartTool } from "./process-start.ts";
import { processStopTool } from "./process-stop.ts";
import { processWaitTool } from "./process-wait.ts";
import { readManyTool } from "./read-many.ts";
import { setRootTool } from "./set-root.ts";
import type { ToolContext, ToolPlugin } from "./types.ts";
import { writeTool } from "./write.ts";

const tools: ToolPlugin[] = [
  listSkillsTool,
  loadSkillTool,
  readManyTool,
  setRootTool,
  lsTool,
  findTool,
  grepTool,
  writeTool,
  applyPatchTool,
  bashTool,
  processStartTool,
  processReadTool,
  processWaitTool,
  processSendTool,
  processInfoTool,
  processStopTool,
];

export function registerTools(server: McpServer, context: ToolContext): void {
  for (const tool of tools) {
    if (tool.available?.(context) === false) continue;
    tool.register(server, context);
  }
  context.pi.registerExtensions(server);
}
