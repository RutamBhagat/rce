import { createFindTool, createGrepTool, createLsTool, createReadTool, type createReadOnlyTools } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import { ROOT } from "./root.ts";

const tools: ReturnType<typeof createReadOnlyTools> = [createReadTool(ROOT), createLsTool(ROOT), createFindTool(ROOT), createGrepTool(ROOT)];

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
}
