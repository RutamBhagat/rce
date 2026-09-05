import { createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool, type createCodingTools } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, type JsonSchemaType, type McpServer } from "@modelcontextprotocol/server";
import { ROOT } from "./root.ts";

const readTool = createReadTool(ROOT);
const tools: ReturnType<typeof createCodingTools> = [readTool, createLsTool(ROOT), createFindTool(ROOT), createGrepTool(ROOT), createWriteTool(ROOT), createEditTool(ROOT), createBashTool(ROOT)];
type ReadArgs = Parameters<typeof readTool.execute>[1];
const readManySchema = {
  type: "object",
  properties: {
    reads: {
      type: "array",
      minItems: 1,
      items: readTool.parameters,
    },
  },
  required: ["reads"],
  additionalProperties: false,
} as const;

export function registerPiTools(server: McpServer) {
  for (const tool of tools) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema<Parameters<typeof tool.execute>[1]>(tool.parameters),
    }, async (args, ctx) => {
      try {
        const result = await tool.execute(crypto.randomUUID(), args, ctx.mcpReq.signal);
        return { content: result.content };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }

  server.registerTool("read_many", {
    description: "Read multiple files or line ranges in one call using the same { path, offset?, limit? } shape as read. Best after grep/find identifies the relevant files, then batch those reads to reduce round trips.",
    inputSchema: fromJsonSchema<{ reads: ReadArgs[] }>(readManySchema as JsonSchemaType),
  }, async ({ reads }, ctx) => {
    const results = await Promise.all(reads.map(async (args) => {
      try {
        return { args, result: await readTool.execute(crypto.randomUUID(), args, ctx.mcpReq.signal) };
      } catch (error) {
        return { args, error: error instanceof Error ? error.message : String(error) };
      }
    }));

    const content = results.flatMap(({ args, result, error }) => {
      const header = { type: "text" as const, text: `=== ${args.path} ===` };
      if (error !== undefined) return [header, { type: "text" as const, text: `Error: ${error}` }];
      return [header, ...result!.content];
    });
    return { content };
  });
}
