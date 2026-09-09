import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
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
      description: "Class 1 core tool. Change the active RCE project root for subsequent filesystem, search, shell, patch, skill, and process operations. Relative paths resolve from the current root. Use this when the task needs to move to another project or directory.",
      inputSchema: fromJsonSchema<{ path: string }>(schema as JsonSchemaType),
    }, async ({ path }) => {
      const root = await context.setRoot(path);
      const content = [{ type: "text" as const, text: root }];
      return { content, structuredContent: { output: content, root } };
    });
  },
};
