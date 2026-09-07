import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
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
      description: "Class 3 manual-only tool. List the Agent Skills installed for this RCE session. Invoke this tool only when the user explicitly asks to list, show, or discover available skills. Do not call it proactively at the start of a task or merely because a skill might be relevant.",
      inputSchema: fromJsonSchema<Record<string, never>>(schema as JsonSchemaType),
    }, async () => textResult(context.skills.list()));
  },
};
