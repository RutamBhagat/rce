import type { McpServer } from "@modelcontextprotocol/server";
import { applyPatchTool } from "./apply-patch.ts";
import { bashTool } from "./bash.ts";
import { codexEventsTool } from "./codex-events.ts";
import { codexProtocolTool } from "./codex-protocol.ts";
import { codexRespondTool } from "./codex-respond.ts";
import { codexRpcTool } from "./codex-rpc.ts";
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
import type { ToolContext, ToolPlugin } from "./types.ts";
import { writeTool } from "./write.ts";

const tools: ToolPlugin[] = [
  listSkillsTool,
  loadSkillTool,
  readManyTool,
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
  codexProtocolTool,
  codexRpcTool,
  codexEventsTool,
  codexRespondTool,
];

export function registerTools(server: McpServer, context: ToolContext): void {
  for (const tool of tools) {
    if (tool.available?.(context) === false) continue;
    tool.register(server, context);
  }
}
