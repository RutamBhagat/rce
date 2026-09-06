import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult } from "./utils.ts";

const schema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const listSkillsTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("list_skills", {
      description: "Discover the Agent Skills available to this RCE session. It is strongly advised to call this near the start of a task so you can identify any relevant specialized skills before proceeding. If a skill looks useful, call load_skill with its exact name to load the full instructions only when needed.",
      inputSchema: fromJsonSchema<Record<string, never>>(schema as JsonSchemaType),
    }, async () => textResult(context.skills.list()));
  },
};
