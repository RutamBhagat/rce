import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./register-tool.ts";
import type { ToolPlugin } from "./types.ts";

const schema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      minLength: 1,
      description: "Directory to make the active RCE project root. Relative paths resolve from the current root.",
    },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export const setRootTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "set_root", {
      description: "Change the project root for subsequent tool calls. Relative paths resolve from the current root.",
      inputSchema: fromJsonSchema<{ path: string }>(schema as JsonSchemaType),
    }, async ({ path }) => {
      const root = await context.setRoot(path);
      return { content: [{ type: "text" as const, text: root }] };
    });
  },
};
