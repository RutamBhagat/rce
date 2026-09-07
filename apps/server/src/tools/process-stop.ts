import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
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
      description: "Stop a process by closing its pane. Close its RCE workspace when no child panes remain.",
      inputSchema: fromJsonSchema<{ handle: string }>(schema as JsonSchemaType),
    }, async ({ handle }) => {
      try {
        await context.processes!.stop(handle);
        return {
          content: [{ type: "text" as const, text: `Stopped process ${handle}.` }],
          structuredContent: { process: { kind: "stop", handle, state: "stopped" } },
        };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
