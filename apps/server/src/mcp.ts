import { createReadTool } from "@mariozechner/pi-coding-agent";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { ROOT } from "./root.ts";

const read = createReadTool(ROOT);

export const mcp = createMcpHandler(() => {
  const server = new McpServer({ name: "rce", version: "0.1.0" });
  server.registerTool(read.name, {
    description: read.description,
    inputSchema: fromJsonSchema<Parameters<typeof read.execute>[1]>(read.parameters),
  }, async (args, ctx) => {
    const result = await read.execute(crypto.randomUUID(), args, ctx.mcpReq.signal);
    return { content: result.content };
  });
  return server;
}, { legacy: "reject" });
