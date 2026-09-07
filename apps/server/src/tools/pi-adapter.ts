import { fromJsonSchema } from "@modelcontextprotocol/server";
import type { PiToolName } from "../services/pi.ts";
import type { ToolPlugin } from "./types.ts";
import { registerRceTool } from "./app-tool.ts";

export function piTool(name: PiToolName): ToolPlugin {
  return {
    register(server, context) {
      registerRceTool(server, name, {
        description: `Class 1 core tool. ${context.pi.description(name)} If a Class 1 operation fails or its result is unavailable, retry it through bash rather than escalating to a higher tool class.`,
        inputSchema: fromJsonSchema(context.pi.parameters(name)),
      }, async (args, ctx) => {
        const result = await context.pi.execute(name, args, ctx.mcpReq.signal);
        return {
          content: result.content as any,
          // Some MCP hosts surface structuredContent more reliably than content
          // to the model. Mirror Class 1 tool output so stdout/search/listing
          // results remain available without escalating to another tool class.
          structuredContent: { output: result.content },
        };
      });
    },
  };
}
