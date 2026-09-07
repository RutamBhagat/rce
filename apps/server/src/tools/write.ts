import type { WriteToolInput } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
import { buildDiffPayload, snapshotMutations, type FileMutation } from "./file-diff.ts";
import type { ToolPlugin } from "./types.ts";

export const writeTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "write", {
      description: `Class 1 core tool. ${context.pi.description("write")} If writing fails or the result is unavailable, retry through the Class 1 bash tool.`,
      inputSchema: fromJsonSchema<WriteToolInput>(context.pi.parameters("write")),
    }, async (args: WriteToolInput, ctx) => {
      const mutation: FileMutation = { beforePath: args.path, afterPath: args.path };
      const before = await snapshotMutations(context.root, [mutation]);
      const result = await context.pi.execute("write", args, ctx.mcpReq.signal);
      const after = await snapshotMutations(context.root, [mutation]);
      return {
        content: result.content as any,
        structuredContent: {
          output: result.content,
          diff: buildDiffPayload(context.root, [mutation], before, after),
        },
      };
    });
  },
};
