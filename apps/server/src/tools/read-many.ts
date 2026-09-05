import type { ReadToolInput } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";

export const readManyTool: ToolPlugin = {
  register(server, context) {
    const schema = {
      type: "object",
      properties: {
        reads: {
          type: "array",
          minItems: 1,
          items: context.pi.readParameters,
        },
      },
      required: ["reads"],
      additionalProperties: false,
    } as const;

    server.registerTool("read_many", {
      description: "Read multiple files or line ranges in one call using the same { path, offset?, limit? } shape as read. Best after grep/find identifies the relevant files, then batch those reads to reduce round trips.",
      inputSchema: fromJsonSchema<{ reads: ReadToolInput[] }>(schema as JsonSchemaType),
    }, async ({ reads }, ctx) => {
      const results = await Promise.all(reads.map(async (args) => {
        try {
          return { args, result: await context.pi.read(args, ctx.mcpReq.signal) };
        } catch (error) {
          return { args, error: error instanceof Error ? error.message : String(error) };
        }
      }));

      const content = results.flatMap(({ args, result, error }) => {
        const header = { type: "text" as const, text: `=== ${args.path} ===` };
        if (error !== undefined) return [header, { type: "text" as const, text: `Error: ${error}` }];
        return [header, ...result!.content];
      });
      return { content: content as any };
    });
  },
};
