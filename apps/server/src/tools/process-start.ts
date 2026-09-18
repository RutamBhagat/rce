import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: { command: { type: "string", minLength: 1, pattern: "\\S" } },
  required: ["command"],
  additionalProperties: false,
} as const;

export const processStartTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_start", {
      description: "Start a persistent or interactive command and return its process handle.",
      inputSchema: fromJsonSchema<{ command: string }>(schema as JsonSchemaType),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    }, async ({ command }, ctx) => {
      try {
        const handle = await context.processes!.start(command, ctx.mcpReq.signal);
        return { content: [{ type: "text" as const, text: handle }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
