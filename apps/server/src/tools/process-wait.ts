import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

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
    server.registerTool("process_wait", {
      description: "Search current recent unwrapped output immediately, then wait for a literal substring or Rust regex. Existing output is eligible, but a match against the echoed process_start command is rejected. Timeout is in milliseconds. Omit timeout to wait indefinitely. Specify exactly one of match or regex.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, lines, match, regex, timeout }, ctx) => {
      try {
        const result = await context.processes!.wait(handle, { lines, match, regex, timeout }, ctx.mcpReq.signal);
        return textResult(JSON.stringify(result));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
