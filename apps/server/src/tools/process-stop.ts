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

export const processStopTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_stop", {
      description: "Stop a persistent process and close its pane.",
      inputSchema: fromJsonSchema<{ handle: string }>(schema as JsonSchemaType),
    }, async ({ handle }) => {
      try {
        await context.processes!.stop(handle);
        return { content: [{ type: "text" as const, text: `Stopped process ${handle}.` }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
