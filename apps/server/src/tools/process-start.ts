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
      description: "Start a persistent or interactive shell command in the project using Herdr and return its pane handle. Prefer Codex command/exec for simple one-shot commands; use process_* when state, interaction, or long-running output must persist across calls.",
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
