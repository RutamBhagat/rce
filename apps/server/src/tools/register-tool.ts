import type { McpServer } from "@modelcontextprotocol/server";

type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  _meta?: Record<string, unknown>;
};

export function registerRceTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: (args: any, ctx: any) => any,
): void {
  (server.registerTool as any)(name, config, async (args: any, ctx: any) => {
    try {
      return await handler(args, ctx);
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
}
