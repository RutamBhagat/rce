import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { isInputRequiredResult, type McpServer } from "@modelcontextprotocol/server";

export const TOOL_RESULT_RESOURCE_URI = "ui://rce/tool-result.html";

type ToolResult = {
  content?: unknown[];
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
  handler: (args: any, ctx: any) => any,
): void {
  (registerAppTool as any)(server, name, {
    ...config,
    _meta: {
      ...config._meta,
      ui: {
        ...((config._meta?.ui as Record<string, unknown> | undefined) ?? {}),
        resourceUri: TOOL_RESULT_RESOURCE_URI,
        visibility: ["model"],
      },
    },
  }, async (args: any, ctx: any) => {
    const started = performance.now();
    try {
      const result = await handler(args, ctx);
      if (isInputRequiredResult(result)) return result;
      return withServerDuration(result, started, name);
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
