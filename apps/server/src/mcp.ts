import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { PiService } from "./services/pi.ts";
import { ProcessManager } from "./services/process-manager.ts";
import { SkillService } from "./services/skills.ts";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";
import { VERSION } from "./version.ts";

export async function createMcp(root: string, origin: string) {
  const context: ToolContext = {
    root,
    pi: PiService.create(root),
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
      instructions: "Use the core tools for ordinary coding work. Reserve process_* for persistent, interactive, or long-running commands. Use skills only when explicitly requested. Prefer read_many for batched reads and apply_patch for incremental edits.",
    });
    registerTools(server, context);
    return server;
  }, { legacy: "reject" });
}
