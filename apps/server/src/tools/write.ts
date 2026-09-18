import type { WriteToolInput } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";

export const writeTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "write", {
      description: context.pi.description("write"),
      inputSchema: fromJsonSchema<WriteToolInput>(context.pi.parameters("write")),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    }, async (args: WriteToolInput, ctx) => {
      const result = await context.pi.execute("write", args, ctx.mcpReq.signal);
      return { content: result.content as any };
    });
  },
};
