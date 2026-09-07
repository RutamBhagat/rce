import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
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
      description: "Start a persistent or interactive shell command in the project using Herdr and return its pane handle. Prefer Codex command/exec for simple one-shot commands; use process_* when state, interaction, or long-running output must persist across calls.",
      inputSchema: fromJsonSchema<{ command: string }>(schema as JsonSchemaType),
    }, async ({ command }) => {
      try {
        const handle = await context.processes!.start(command);
        const info = await context.processes!.info(handle);
        return {
          content: [{ type: "text" as const, text: handle }],
          structuredContent: { process: { kind: "start", command, handle, state: info.idle ? "idle" : "running", elapsedMs: info.elapsedMs, details: info } },
        };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
