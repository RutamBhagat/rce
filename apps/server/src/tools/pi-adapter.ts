import { fromJsonSchema } from "@modelcontextprotocol/server";
import type { PiToolName } from "../services/pi.ts";
import type { ToolPlugin } from "./types.ts";
import { registerRceTool } from "./app-tool.ts";

export function piTool(name: PiToolName): ToolPlugin {
  return {
    register(server, context) {
      registerRceTool(server, name, {
        description: context.pi.description(name),
        inputSchema: fromJsonSchema(context.pi.parameters(name)),
      }, async (args, ctx) => {
        const result = await context.pi.execute(name, args, ctx.mcpReq.signal);
        return { content: result.content as any };
      });
    },
  };
}
