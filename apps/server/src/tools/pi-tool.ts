import { fromJsonSchema } from "@modelcontextprotocol/server";
import type { PiToolName } from "../services/pi.ts";
import type { ToolPlugin } from "./types.ts";
import { registerRceTool } from "./register-tool.ts";

const annotations = {
  ls: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  find: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  grep: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  bash: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
} as const;

export function piTool(name: Exclude<PiToolName, "write">): ToolPlugin {
  return {
    register(server, context) {
      registerRceTool(server, name, {
        description: context.pi.description(name),
        inputSchema: fromJsonSchema(context.pi.parameters(name)),
        annotations: annotations[name],
      }, async (args, ctx) => {
        const result = await context.pi.execute(name, args, ctx.mcpReq.signal);
        return { content: result.content as any };
      });
    },
  };
}
