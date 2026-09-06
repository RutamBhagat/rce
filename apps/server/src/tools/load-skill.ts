import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import type { ToolPlugin } from "./types.ts";
import { textResult, toolError } from "./utils.ts";

const schema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Exact skill name from the available-skills catalog in this tool description.",
    },
  },
  required: ["name"],
  additionalProperties: false,
} as const;

export const loadSkillTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("load_skill", {
      description: context.skills.toolDescription,
      inputSchema: fromJsonSchema<{ name: string }>(schema as JsonSchemaType),
    }, async ({ name }) => {
      try {
        return textResult(await context.skills.load(name));
      } catch (error) {
        return toolError(error);
      }
    });
  },
};
