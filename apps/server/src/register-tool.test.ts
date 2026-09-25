import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { formatToolCall, TOOL_LOG_PAYLOAD_LIMIT } from "./tool-call-log.ts";
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

test("tool call logs are visually separated and include formatted payloads", () => {
  const output = formatToolCall({
    id: 7,
    name: "read_many",
    phase: "start",
    payload: { paths: ["a.ts", "b.ts"] },
  });

  assert.match(output, /^\n┌─ TOOL #7 START · read_many\n/);
  assert.match(output, /│ input\n│ \{\n│   "paths": \[/);
  assert.match(output, /\n└─+\n$/);
});

test("tool call log payloads have a hard display cap", () => {
  const output = formatToolCall({
    id: 8,
    name: "read_many",
    phase: "success",
    elapsedMs: 12.34,
    payload: "x".repeat(TOOL_LOG_PAYLOAD_LIMIT * 2),
  });

  assert.match(output, /TOOL #8 OK · read_many · 12\.3ms/);
  assert.match(output, /… \[truncated [\d,]+ display chars\]/);
  assert.ok(output.length < TOOL_LOG_PAYLOAD_LIMIT + 300);

  const newlineHeavyOutput = formatToolCall({
    id: 9,
    name: "bash",
    phase: "success",
    payload: Array.from({ length: TOOL_LOG_PAYLOAD_LIMIT }, () => "x").join("\n"),
  });
  assert.ok(newlineHeavyOutput.length < TOOL_LOG_PAYLOAD_LIMIT + 300);
});

test("failed tool call logs are labeled as errors", () => {
  const output = formatToolCall({
    id: 10,
    name: "bash",
    phase: "error",
    elapsedMs: 1,
    payload: { isError: true, content: [{ type: "text", text: "boom" }] },
  });

  assert.match(output, /TOOL #10 ERROR · bash · 1\.0ms/);
  assert.match(output, /│ result/);
});
