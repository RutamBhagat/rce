import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: { handle: { type: "string", minLength: 1 } },
  required: ["handle"],
  additionalProperties: false,
} as const;

export const processInfoTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_info", {
      description: "Read process state, including PIDs, foreground processes, elapsed time, and whether the shell is currently idle.",
      inputSchema: fromJsonSchema<{ handle: string }>(schema as JsonSchemaType),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }, async ({ handle }, ctx) => {
      try {
        const info = await context.processes!.info(handle, ctx.mcpReq.signal);
        return { content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
