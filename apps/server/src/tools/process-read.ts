import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ProcessReadSource } from "../services/process-manager.ts";
import { registerRceTool } from "./app-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: {
    handle: { type: "string", minLength: 1 },
    lines: { type: "integer", minimum: 1 },
    source: { enum: ["visible", "recent", "recent-unwrapped", "detection"] },
  },
  required: ["handle"],
  additionalProperties: false,
} as const;

type Args = { handle: string; lines?: number; source?: ProcessReadSource };

export const processReadTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_read", {
      description: "Read process terminal output. Source defaults to recent-unwrapped; visible is useful for interactive TUIs, recent-unwrapped for logs/transcripts, and detection for Herdr's agent-detection snapshot. Defaults to the last 80 terminal rows.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, lines, source }) => {
      try {
        const output = await context.processes!.read(handle, { lines, source });
        const info = await context.processes!.info(handle);
        return {
          content: [{ type: "text" as const, text: output }],
          structuredContent: { process: { kind: "read", handle, output, source: source ?? "recent-unwrapped", state: info.idle ? "idle" : "running", elapsedMs: info.elapsedMs, details: info } },
        };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
