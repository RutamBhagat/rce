import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: { handle: { type: "string", minLength: 1 } },
  required: ["handle"],
  additionalProperties: false,
} as const;

export const processStopTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    server.registerTool("process_stop", {
      description: "Stop a process by closing its pane. Close its RCE workspace when no child panes remain.",
      inputSchema: fromJsonSchema<{ handle: string }>(schema as JsonSchemaType),
    }, async ({ handle }) => {
      try {
        await context.processes!.stop(handle);
        return textResult(`Stopped process ${handle}.`);
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
