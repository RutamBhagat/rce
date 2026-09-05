import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: { command: { type: "string", minLength: 1, pattern: "\\S" } },
  required: ["command"],
  additionalProperties: false,
} as const;

export const processStartTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    server.registerTool("process_start", {
      description: "Start a persistent shell command in the invocation directory. Return its Herdr pane ID as the process handle.",
      inputSchema: fromJsonSchema<{ command: string }>(schema as JsonSchemaType),
    }, async ({ command }) => {
      try {
        return textResult(await context.processes!.start(command));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
