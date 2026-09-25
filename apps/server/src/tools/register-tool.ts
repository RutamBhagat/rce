import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { allocateToolCallId, writeToolCall } from "../tool-call-log.ts";

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
    const callId = allocateToolCallId();
    const started = performance.now();
    writeToolCall({ id: callId, name, phase: "start", payload: args });

    let result: any;
    try {
      result = await handler(args, ctx);
    } catch (error) {
      result = {
        isError: true,
        content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      };
    }

    writeToolCall({
      id: callId,
      name,
      phase: result?.isError === true ? "error" : "success",
      elapsedMs: performance.now() - started,
      payload: result,
    });
    return result;
  });
}
