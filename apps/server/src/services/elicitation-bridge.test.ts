import assert from "node:assert/strict";
import test from "node:test";
import type { ServerContext } from "@modelcontextprotocol/server";
import { isInputRequiredResult } from "@modelcontextprotocol/server";
import { McpElicitationBridge } from "./elicitation-bridge.ts";

function context(requestState?: string, inputResponses?: Record<string, unknown>): ServerContext {
  const signal = new AbortController().signal;
  return {
    mcpReq: {
      requestState: () => requestState,
      inputResponses,
      signal,
    },
  } as unknown as ServerContext;
}

test("suspends and resumes the same downstream call across elicitation", async () => {
  const bridge = new McpElicitationBridge();
  let runs = 0;
  const args = { value: 1 };

  const run = async () => {
    runs += 1;
    const choice = await bridge.ui.select(
      "MCP Input Request\nServer: fake\n\nAllow this test?",
      ["Continue", "Decline"],
    );
    return { content: [{ type: "text", text: String(choice) }] };
  };

  const first = await bridge.execute("fake", "fake_tool", args, context(), run);
  assert.equal(isInputRequiredResult(first), true);
  assert.equal(runs, 1);
  if (!isInputRequiredResult(first)) return;

  const [inputId] = Object.keys(first.inputRequests ?? {});
  assert.ok(inputId);
  assert.ok(first.requestState);

  const second = await bridge.execute(
    "fake",
    "fake_tool",
    args,
    context(first.requestState, {
      [inputId]: { action: "accept", content: { choice: "Continue" } },
    }),
    run,
  );

  assert.equal(runs, 1, "the downstream tool must not be replayed after approval");
  assert.deepEqual(second, { content: [{ type: "text", text: "Continue" }] });
});
