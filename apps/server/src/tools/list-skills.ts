import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";
import { textResult } from "./utils.ts";

const schema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const listSkillsTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "list_skills", {
      description: "List installed Agent Skills. Use only when the user asks to discover skills.",
      inputSchema: fromJsonSchema<Record<string, never>>(schema as JsonSchemaType),
    }, async () => textResult(context.skills.list()));
  },
};
