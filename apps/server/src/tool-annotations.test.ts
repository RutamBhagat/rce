import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

test("every RCE tool advertises its complete safety annotation profile", () => {
  const registered = new Map<string, any>();
  const server = {
    registerTool(name: string, config: unknown) {
      registered.set(name, config);
    },
  } as unknown as McpServer;
  const context = {
    root: "/project",
    pi: {
      description: (name: string) => name,
      parameters: () => ({ type: "object" }),
      execute: async () => ({ content: [] }),
    },
    skills: {
      toolDescription: "Load a skill",
      list: () => "",
      load: async () => "",
    },
    processes: {
      info: async () => ({}),
      read: async () => "",
      wait: async () => ({}),
      start: async () => "handle",
      send: async () => {},
      stop: async () => {},
    },
    setRoot: async (root: string) => root,
  } as unknown as ToolContext;

  registerTools(server, context);

  const expected = {
    list_skills: readOnly,
    load_skill: readOnly,
    read_many: readOnly,
    set_root: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ls: readOnly,
    find: readOnly,
    grep: readOnly,
    write: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    apply_patch: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    bash: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    process_start: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    process_read: readOnly,
    process_wait: readOnly,
    process_send: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    process_info: readOnly,
    process_stop: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  };

  assert.deepEqual(Object.fromEntries([...registered].map(([name, config]) => [name, config.annotations])), expected);
});
