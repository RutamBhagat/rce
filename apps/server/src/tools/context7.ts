import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { queryContext7Docs, resolveContext7Library } from "../services/context7.ts";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { textResult } from "./utils.ts";

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const resolveSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "What to look up in the library's documentation. Used to rank library results by relevance.",
    },
    libraryName: {
      type: "string",
      description: "Official library or product name to resolve to a Context7-compatible library ID.",
    },
  },
  required: ["query", "libraryName"],
  additionalProperties: false,
} as const;

const querySchema = {
  type: "object",
  properties: {
    libraryId: {
      type: "string",
      description: "Exact Context7-compatible library ID, for example '/vercel/next.js'.",
    },
    query: {
      type: "string",
      description: "Specific documentation question, scoped to a single concept.",
    },
  },
  required: ["libraryId", "query"],
  additionalProperties: false,
} as const;

export const context7Tools: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "resolve-library-id", {
      title: "Resolve Context7 Library ID",
      description: "Resolve a package or product name to a Context7-compatible library ID. Call this before query-docs unless the user already supplied a Context7 library ID.",
      inputSchema: fromJsonSchema<{ query: string; libraryName: string }>(resolveSchema as JsonSchemaType),
      annotations,
    }, async ({ query, libraryName }, ctx) => textResult(
      await resolveContext7Library(context.root, query, libraryName, ctx.mcpReq.signal),
    ));

    registerRceTool(server, "query-docs", {
      title: "Query Documentation",
      description: "Retrieve up-to-date documentation and code examples from Context7 for a resolved library ID.",
      inputSchema: fromJsonSchema<{ libraryId: string; query: string }>(querySchema as JsonSchemaType),
      annotations,
    }, async ({ libraryId, query }, ctx) => textResult(
      await queryContext7Docs(context.root, query, libraryId, ctx.mcpReq.signal),
    ));
  },
};
