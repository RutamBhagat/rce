import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerToolResultApp } from "./mcp-app.ts";
import { TOOL_RESULT_RESOURCE_URI } from "./tools/app-tool.ts";

test("tool result resource advertises CSP and a stable widget domain", async () => {
  let registeredConfig: any;
  let registeredHandler: ((uri: URL, extra: unknown) => Promise<any>) | undefined;
  const server = {
    registerResource(
      _name: string,
      _uri: string,
      config: unknown,
      handler: (uri: URL, extra: unknown) => Promise<any>,
    ) {
      registeredConfig = config;
      registeredHandler = handler;
      return {};
    },
  } as unknown as McpServer;

  const origin = "https://rce.example.com";
  registerToolResultApp(server, origin, async () => "<html></html>");

  assert.equal(registeredConfig._meta.ui.domain, origin);
  assert.deepEqual(registeredConfig._meta.ui.csp, {
    connectDomains: [],
    resourceDomains: [],
  });

  assert.ok(registeredHandler);
  const result = await registeredHandler(new URL(TOOL_RESULT_RESOURCE_URI), {});
  const meta = result.contents[0]._meta;
  assert.equal(meta.ui.domain, origin);
  assert.deepEqual(meta.ui.csp, {
    connectDomains: [],
    resourceDomains: [],
  });
  assert.equal(meta["openai/widgetDomain"], origin);
  assert.deepEqual(meta["openai/widgetCSP"], {
    connect_domains: [],
    resource_domains: [],
  });
});
