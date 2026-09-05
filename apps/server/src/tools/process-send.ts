import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

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
    server.registerTool("process_send", {
      description: "Send literal text without Enter, or an ordered array of terminal keys/chords such as Enter and ctrl+c. Specify exactly one of text or keys.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, text, keys }) => {
      try {
        await context.processes!.send(handle, text === undefined ? { keys: keys! } : { text });
        return textResult(`Sent input to process ${handle}.`);
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
