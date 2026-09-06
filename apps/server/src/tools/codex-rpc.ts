import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  oneOf: [
    {
      type: "object",
      properties: {
        method: { type: "string", minLength: 1 },
        params: {},
        wait_ms: { type: "integer", minimum: 0, maximum: 120000 },
      },
      required: ["method"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        handle: { type: "string", minLength: 1 },
        wait_ms: { type: "integer", minimum: 0, maximum: 120000 },
      },
      required: ["handle"],
      additionalProperties: false,
    },
  ],
} as const;

type Args =
  | { method: string; params?: unknown; wait_ms?: number }
  | { handle: string; wait_ms?: number };

export const codexRpcTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("codex_rpc", {
      description: "Primary Codex app-server control plane. Call any client-request method except connection-handshake and Codex-model execution methods; use codex_protocol when the schema is unknown. If approval/input is requested, answer with codex_respond then resume the returned handle.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async (args) => {
      try {
        const result = "handle" in args
          ? await context.codex.rpc({ handle: args.handle, waitMs: args.wait_ms })
          : await context.codex.rpc({ method: args.method, params: args.params as any, waitMs: args.wait_ms });
        return textResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
