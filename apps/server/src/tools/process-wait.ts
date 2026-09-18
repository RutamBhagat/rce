import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { toolError } from "./utils.ts";

const common = {
  handle: { type: "string", minLength: 1 },
  lines: { type: "integer", minimum: 1 },
  timeout: { type: "integer", minimum: 0 },
} as const;
const schema = {
  oneOf: [
    {
      type: "object",
      properties: { ...common, match: { type: "string", minLength: 1 } },
      required: ["handle", "match"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { ...common, regex: { type: "string", minLength: 1 } },
      required: ["handle", "regex"],
      additionalProperties: false,
    },
  ],
} as const;

type Args = { handle: string; lines?: number; match?: string; regex?: string; timeout?: number };

export const processWaitTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_wait", {
      description: "Wait for a literal substring or Rust regex in process output. Existing output is eligible. Timeout is milliseconds; omit it to wait indefinitely. Specify exactly one of match or regex.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }, async ({ handle, lines, match, regex, timeout }, ctx) => {
      try {
        const result = await context.processes!.wait(handle, { lines, match, regex, timeout }, ctx.mcpReq.signal);
        const text = result.matched_line ? `Matched: ${result.matched_line}` : "Process wait completed.";
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
