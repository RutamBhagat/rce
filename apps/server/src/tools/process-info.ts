import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: { handle: { type: "string", minLength: 1 } },
  required: ["handle"],
  additionalProperties: false,
} as const;

export const processInfoTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    server.registerTool("process_info", {
      description: "Read a structured Herdr process-state snapshot for a process pane, including shell PID, foreground process group, foreground processes, and a derived idle flag. idle means the pane shell is foreground at this instant; it is not a completion event.",
      inputSchema: fromJsonSchema<{ handle: string }>(schema as JsonSchemaType),
    }, async ({ handle }) => {
      try {
        return textResult(JSON.stringify(await context.processes!.info(handle)));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
