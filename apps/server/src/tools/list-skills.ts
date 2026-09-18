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
      description: "List installed Agent Skills, task descriptions, invocation mode, and bundled helper files. Use this when a skill might apply but you do not know its exact name.",
      inputSchema: fromJsonSchema<Record<string, never>>(schema as JsonSchemaType),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }, async () => textResult(context.skills.list()));
  },
};
