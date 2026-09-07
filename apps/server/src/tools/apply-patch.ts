import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { execFile } from "node:child_process";
import { lstat, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolPlugin } from "./types.ts";
import { registerRceTool } from "./app-tool.ts";
import { buildDiffPayload, extractPatchMutations, snapshotMutations } from "./file-diff.ts";
import { toolError } from "./utils.ts";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const codexEntrypoint = require.resolve("@openai/codex/bin/codex.js");
const pathMarker = /^\s*\*\*\* (?:Add File|Delete File|Update File|Move to): (.+?)\s*$/;

const schema = {
  type: "object",
  properties: {
    patch: { type: "string", minLength: 1 },
  },
  required: ["patch"],
  additionalProperties: false,
} as const;

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function nearestExistingAncestor(target: string): Promise<string> {
  let current = target;
  while (true) {
    try {
      await stat(current);
      return current;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

async function assertNoSymlinkTraversal(root: string, target: string, patchPath: string): Promise<void> {
  const relative = path.relative(root, target);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Patch path traverses a symlink: ${patchPath}`);
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }
}

async function validatePatchPaths(root: string, patchText: string): Promise<void> {
  const rootReal = await realpath(root);
  for (const line of patchText.split(/\r?\n/)) {
    const match = pathMarker.exec(line);
    if (!match) continue;

    const patchPath = match[1]!;
    if (path.isAbsolute(patchPath) || path.win32.isAbsolute(patchPath)) {
      throw new Error(`Patch paths must be relative to the RCE root: ${patchPath}`);
    }

    const target = path.resolve(root, patchPath);
    if (!isWithin(root, target)) {
      throw new Error(`Patch path escapes the RCE root: ${patchPath}`);
    }

    await assertNoSymlinkTraversal(root, target, patchPath);
    const ancestor = await nearestExistingAncestor(target);
    const ancestorReal = await realpath(ancestor);
    if (!isWithin(rootReal, ancestorReal)) {
      throw new Error(`Patch path traverses outside the RCE root through a symlink: ${patchPath}`);
    }
  }
}

export const applyPatchTool: ToolPlugin = {
  register(server, context) {
    registerRceTool(server, "apply_patch", {
      description: "Use this when an edit spans multiple files or benefits from one structured incremental patch. Applies Codex-format add, update, move, and delete operations across one or more text files.",
      inputSchema: fromJsonSchema<{ patch: string }>(schema as JsonSchemaType),
    }, async ({ patch }, ctx) => {
      try {
        await validatePatchPaths(context.root, patch);
        const mutations = extractPatchMutations(patch);
        const before = await snapshotMutations(context.root, mutations);
        const { stdout, stderr } = await exec(process.execPath, [
          codexEntrypoint,
          "--codex-run-as-apply-patch",
          patch,
        ], {
          cwd: context.root,
          env: { ...process.env, CODEX_APPLY_PATCH_PRESERVE_LINE_ENDINGS: "1" },
          signal: ctx.mcpReq.signal,
          maxBuffer: 4 * 1024 * 1024,
        });
        const after = await snapshotMutations(context.root, mutations);
        const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        return {
          content: [{ type: "text" as const, text: text || "Patch applied." }],
          structuredContent: {
            diff: buildDiffPayload(context.root, mutations, before, after),
          },
        };
      } catch (error) {
        const stderr = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
          ? error.stderr.trim()
          : "";
        return stderr
          ? { isError: true, content: [{ type: "text" as const, text: stderr }] }
          : toolError(error);
      }
    });
  },
};
