import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerRceTool, TOOL_RESULT_RESOURCE_URI } from "./tools/app-tool.ts";

test("RCE tools advertise the MCP App resource and include timing metadata", async () => {
  let registeredConfig: any;
  let registeredHandler: ((args: unknown, ctx: unknown) => Promise<any>) | undefined;
  const server = {
    registerTool(_name: string, config: unknown, handler: (args: unknown, ctx: unknown) => Promise<any>) {
      registeredConfig = config;
      registeredHandler = handler;
    },
  } as unknown as McpServer;

  registerRceTool(server, "demo", { description: "demo" }, async () => ({
    content: [{ type: "text", text: "ok" }],
  }));

  assert.equal(registeredConfig._meta.ui.resourceUri, TOOL_RESULT_RESOURCE_URI);
  assert.deepEqual(registeredConfig._meta.ui.visibility, ["model"]);
  assert.equal(registeredConfig._meta["ui/resourceUri"], TOOL_RESULT_RESOURCE_URI);

  assert.ok(registeredHandler);
  const result = await registeredHandler({}, { mcpReq: { signal: undefined } });
  assert.equal(result.structuredContent.toolName, "demo");
  assert.equal(typeof result.structuredContent.serverDurationMs, "number");
});
