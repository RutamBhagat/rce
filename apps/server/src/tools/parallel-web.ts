import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { parallelFetch, parallelSearch, type ParallelFetchInput, type ParallelSearchInput } from "../services/parallel.ts";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const searchSchema = {
  type: "object",
  properties: {
    objective: {
      type: "string",
      description: "Natural-language description of the underlying question or goal driving the search. Used together with search_queries to focus results on the most relevant content. Should be self-contained with enough context to understand the intent of the search.",
    },
    search_queries: {
      type: "array",
      minItems: 1,
      items: {
        type: "string",
        description: "Concise keyword search queries, 3-6 words each. Provide 2-3 for best results.",
      },
    },
  },
  required: ["objective", "search_queries"],
  additionalProperties: false,
} as const;

const fetchSchema = {
  type: "object",
  properties: {
    urls: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string" },
      description: "List of HTTP/HTTPS URLs to extract content from. Batch multiple URLs into one call.",
    },
    objective: {
      type: "string",
      description: "Optional natural-language goal used to focus the extracted excerpts.",
    },
    search_queries: {
      type: "array",
      items: { type: "string" },
      description: "Optional keyword queries used with objective to focus excerpts.",
    },
  },
  required: ["urls"],
  additionalProperties: false,
} as const;

export const parallelWebTools: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "web_search", {
      description: "Search the web using Parallel's Search API. Prefer this for current web results and source discovery.",
      inputSchema: fromJsonSchema<ParallelSearchInput>(searchSchema as JsonSchemaType),
      annotations,
    }, async (args: ParallelSearchInput, ctx) => ({
      content: [{
        type: "text" as const,
        text: JSON.stringify(await parallelSearch(context.root, args, ctx.mcpReq.signal), null, 2),
      }],
    }));

    registerRceTool(server, "web_fetch", {
      description: "Fetch and extract readable content from one or more URLs using Parallel's Extract API.",
      inputSchema: fromJsonSchema<ParallelFetchInput>(fetchSchema as JsonSchemaType),
      annotations,
    }, async (args: ParallelFetchInput, ctx) => ({
      content: [{
        type: "text" as const,
        text: JSON.stringify(await parallelFetch(context.root, args, ctx.mcpReq.signal), null, 2),
      }],
    }));
  },
};
