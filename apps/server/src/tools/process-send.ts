import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
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
      description: "Class 2 Herdr tool. Send literal text without Enter, or an ordered array of terminal keys/chords such as Enter and ctrl+c to an existing Herdr process. Specify exactly one of text or keys. Use only for an existing persistent/interactive Herdr process, not as a Class 1 fallback.",
      inputSchema: fromJsonSchema<Args>(schema as JsonSchemaType),
    }, async ({ handle, text, keys }) => {
      try {
        await context.processes!.send(handle, text === undefined ? { keys: keys! } : { text });
        const info = await context.processes!.info(handle);
        return {
          content: [{ type: "text" as const, text: `Sent input to process ${handle}.` }],
          structuredContent: { process: { kind: "send", handle, state: info.idle ? "idle" : "running", elapsedMs: info.elapsedMs, input: text === undefined ? { keys } : { text }, details: info } },
        };
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
