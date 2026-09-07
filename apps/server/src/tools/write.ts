import type { WriteToolInput } from "@earendil-works/pi-coding-agent";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { registerRceTool } from "./app-tool.ts";
import { buildDiffPayload, snapshotMutations, type FileMutation } from "./file-diff.ts";
import type { ToolPlugin } from "./types.ts";

export const writeTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "write", {
      description: context.pi.description("write"),
      inputSchema: fromJsonSchema<WriteToolInput>(context.pi.parameters("write")),
    }, async (args: WriteToolInput, ctx) => {
      const mutation: FileMutation = { beforePath: args.path, afterPath: args.path };
      const before = await snapshotMutations(context.root, [mutation]);
      const result = await context.pi.execute("write", args, ctx.mcpReq.signal);
      const after = await snapshotMutations(context.root, [mutation]);
      return {
        content: result.content as any,
        structuredContent: {
          diff: buildDiffPayload(context.root, [mutation], before, after),
        },
      };
    });
  },
};
