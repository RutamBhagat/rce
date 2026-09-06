import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 500 },
  },
  additionalProperties: false,
} as const;

export const codexEventsTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("codex_events", {
      description: "Drain buffered Codex app-server notifications and list unanswered server-initiated requests plus pending raw RPC calls. Pending server requests remain until answered with codex_respond.",
      inputSchema: fromJsonSchema<{ limit?: number }>(schema as JsonSchemaType),
    }, async ({ limit }) => {
      try {
        return textResult(JSON.stringify(context.codex.events(limit), null, 2));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
