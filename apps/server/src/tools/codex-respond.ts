import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const idSchema = { oneOf: [{ type: "integer" }, { type: "string" }] } as const;
const errorSchema = {
  type: "object",
  properties: {
    code: { type: "integer" },
    message: { type: "string" },
    data: {},
  },
  required: ["code", "message"],
  additionalProperties: false,
} as const;

const schema = {
  oneOf: [
    {
      type: "object",
      properties: { id: idSchema, result: {} },
      required: ["id", "result"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { id: idSchema, error: errorSchema },
      required: ["id", "error"],
      additionalProperties: false,
    },
  ],
} as const;

type Args =
  | { id: string | number; result: unknown }
  | { id: string | number; error: { code: number; message: string; data?: unknown } };

export const codexRespondTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("codex_respond", {
      description: "Answer a pending server-initiated Codex app-server request returned by codex_rpc or codex_events. Use codex_protocol with kind=server_request to inspect the request/response schema when needed.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async (args) => {
      try {
        const result = "error" in args
          ? await context.codex.respond({ id: args.id, error: args.error as any })
          : await context.codex.respond({ id: args.id, result: args.result as any });
        return textResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
