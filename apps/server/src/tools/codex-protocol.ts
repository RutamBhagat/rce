import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["client_request", "server_request", "notification"],
      description: "Protocol direction to inspect. Defaults to client_request.",
    },
    method: { type: "string", minLength: 1 },
    query: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 500 },
  },
  additionalProperties: false,
} as const;

type Args = {
  kind?: "client_request" | "server_request" | "notification";
  method?: string;
  query?: string;
  limit?: number;
};

export const codexProtocolTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("codex_protocol", {
      description: "Inspect the exact Codex app-server protocol generated from RCE's installed Codex binary. Search/list methods, or provide an exact method to get its parameter schema and, when available, response schema.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async (args) => {
      try {
        return textResult(JSON.stringify(await context.codex.protocol(args), null, 2));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
