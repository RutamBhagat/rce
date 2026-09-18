import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerRceTool } from "./tools/register-tool.ts";

test("RCE tools register without client UI metadata", async () => {
  let registeredConfig: any;
  let registeredHandler: ((args: unknown, ctx: unknown) => Promise<any>) | undefined;
  const server = {
    registerTool(_name: string, config: unknown, handler: (args: unknown, ctx: unknown) => Promise<any>) {
      registeredConfig = config;
      registeredHandler = handler;
    },
  } as unknown as McpServer;

  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  registerRceTool(server, "demo", { description: "demo", annotations }, async () => ({
    content: [{ type: "text", text: "ok" }],
  }));

  assert.equal(registeredConfig._meta, undefined);
  assert.deepEqual(registeredConfig.annotations, annotations);

  assert.ok(registeredHandler);
  const result = await registeredHandler({}, { mcpReq: { signal: undefined } });
  assert.deepEqual(result, { content: [{ type: "text", text: "ok" }] });
});
