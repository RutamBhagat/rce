import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ProcessReadSource } from "../services/process-manager.ts";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

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
    server.registerTool("process_read", {
      description: "Read process terminal output. Source defaults to recent-unwrapped; visible is useful for interactive TUIs, recent-unwrapped for logs/transcripts, and detection for Herdr's agent-detection snapshot. Defaults to the last 80 terminal rows.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, lines, source }) => {
      try {
        return textResult(await context.processes!.read(handle, { lines, source }));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
