import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { registerToolResultApp } from "./mcp-app.ts";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";
import { VERSION } from "./version.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    pi: await PiService.create(root),
    skills: await SkillService.create(root),
    processes: ProcessManager.create(root, origin),
    async setRoot(input: string) {
      const candidate = path.resolve(context.root, input);
      const nextRoot = await realpath(candidate);
      if (!(await stat(nextRoot)).isDirectory()) throw new Error(`Not a directory: ${input}`);

      context.pi.setRoot(nextRoot);
      context.skills = await SkillService.create(nextRoot);
      context.processes = ProcessManager.create(nextRoot, origin);
      context.root = nextRoot;
      return nextRoot;
    },
  };

  return createMcpHandler(() => {
    const server = new McpServer({ name: "rce", version: VERSION }, {
      instructions: "RCE tools are grouped into four classes. Class 1: core Pi-backed filesystem, search, shell, read/write, patch, and workspace-root tools; use these freely for ordinary coding work. The model may use set_root to change the active project directory when the user's task requires working elsewhere. Class 2: Herdr process_* tools; use these only when persistent, interactive, or long-running process state is actually needed. Class 3: Pi Agent Skills (list_skills/load_skill). Class 4: Pi MCP plugin/extension tools discovered from the local Codex MCP configuration, including web search, Context7, browser/CUA, and other external MCP tools. Classes 3 and 4 are manual-only: do not invoke them unless the user explicitly asks to use that skill, plugin, extension, service, or capability. Never escalate from Class 1 or 2 to Class 3 or 4 merely because a lower-class tool failed, returned incomplete/unavailable output, or was inconvenient. For ordinary one-shot coding operations, prefer Class 1. If any Class 1 filesystem/search/read/write/patch operation fails, produces unusable output, or its result is unavailable to the model, retry the operation through the Class 1 bash tool. Do not use Class 2 as a fallback for ordinary one-shot commands; reserve process_* for work that actually requires persistence, interaction, or long-running process state. Prefer read_many for efficient batched/ranged reads and apply_patch for structured multi-file edits. Do not use the MCP gateway tool when an equivalent direct tool is available.",
    });
    registerToolResultApp(server, origin);
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
