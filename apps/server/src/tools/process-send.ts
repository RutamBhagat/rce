import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { toolError } from "./utils.ts";

const schema = {
  oneOf: [
    {
      type: "object",
      properties: {
        handle: { type: "string", minLength: 1 },
        text: { type: "string" },
      },
      required: ["handle", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        handle: { type: "string", minLength: 1 },
        keys: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      },
      required: ["handle", "keys"],
      additionalProperties: false,
    },
  ],
} as const;

type Args = { handle: string; text?: string; keys?: string[] };

export const processSendTool: ToolPlugin = {
  available: (context) => context.processes !== undefined,
  register(server, context) {
    registerRceTool(server, "process_send", {
      description: "Send literal text without Enter, or terminal keys/chords such as Enter and ctrl+c, to a process. Specify exactly one of text or keys.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, text, keys }, ctx) => {
      try {
        await context.processes!.send(handle, text === undefined ? { keys: keys! } : { text }, ctx.mcpReq.signal);
        return { content: [{ type: "text" as const, text: `Sent input to process ${handle}.` }] };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
