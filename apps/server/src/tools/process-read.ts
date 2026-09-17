import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ProcessReadSource } from "../services/process-manager.ts";
import { registerRceTool } from "./register-tool.ts";
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
      description: "Read terminal output from a persistent process. Defaults to the last 80 recent unwrapped rows; use visible for interactive TUIs or detection for the agent snapshot.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, lines, source }, ctx) => {
      try {
        const output = await context.processes!.read(handle, { lines, source }, ctx.mcpReq.signal);
        return { content: [{ type: "text" as const, text: output }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
