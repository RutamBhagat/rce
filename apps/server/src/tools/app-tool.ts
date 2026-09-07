import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

export const TOOL_RESULT_RESOURCE_URI = "ui://rce/tool-result.html";

type ToolResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
};

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
  handler: (args: any, ctx: any) => ToolResult | Promise<ToolResult>,
): void {
  (registerAppTool as any)(server, name, {
    ...config,
    _meta: {
      ...config._meta,
      ui: {
        ...((config._meta?.ui as Record<string, unknown> | undefined) ?? {}),
        resourceUri: TOOL_RESULT_RESOURCE_URI,
      },
    },
  }, async (args: any, ctx: any) => {
    const started = performance.now();
    try {
      return withServerDuration(await handler(args, ctx), started, name);
    } catch (error) {
      return withServerDuration({
        isError: true,
        content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      }, started, name);
    }
  });
}

function withServerDuration(result: ToolResult, started: number, toolName: string): ToolResult {
  const serverDurationMs = Math.round((performance.now() - started) * 100) / 100;
  return {
    ...result,
    structuredContent: {
      ...(result.structuredContent ?? {}),
      toolName,
      serverDurationMs,
    },
  };
}
