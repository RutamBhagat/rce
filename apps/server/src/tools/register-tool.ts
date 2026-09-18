import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";

type RceToolAnnotations = ToolAnnotations & {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations: RceToolAnnotations;
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
