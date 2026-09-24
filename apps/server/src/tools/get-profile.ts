import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";

const inputSchema = { type: "object", properties: {}, additionalProperties: false } as const;
const outputSchema = {
  type: "object",
  properties: { id: { type: "string", minLength: 1, pattern: "\\S" }, name: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
} as const;

export const getProfileTool: ToolPlugin = {
  register(server, _context) {
    registerRceTool(server, "get_profile", {
      description: "Return the profile for this authenticated RCE connection.",
      inputSchema: fromJsonSchema<Record<string, never>>(inputSchema as JsonSchemaType),
      outputSchema: fromJsonSchema<{ id: string; name: string }>(outputSchema as JsonSchemaType),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { "openai/profile": true },
    }, async (_args, ctx) => {
      const id = ctx.http?.authInfo?.extra?.profileId;
      if (typeof id !== "string" || !id.trim()) throw new Error("Authenticated profile identity is unavailable");
      const profile = { id, name: "RCE" };
      return { structuredContent: profile, content: [{ type: "text" as const, text: JSON.stringify(profile) }] };
    });
  },
};
