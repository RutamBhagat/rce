import { createTwoFilesPatch, diffLines } from "diff";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type FileMutation = {
  beforePath?: string;
  afterPath?: string;
};

type Snapshot = {
  exists: boolean;
  content: string;
};

export type DiffFileSummary = {
  path: string;
  oldPath?: string;
  newPath?: string;
  status: "created" | "deleted" | "renamed" | "modified";
  additions: number;
  deletions: number;
};

export type DiffPayload = {
  patch: string;
  files: DiffFileSummary[];
  additions: number;
  deletions: number;
};

export async function snapshotMutations(
  root: string,
  mutations: FileMutation[],
): Promise<Map<string, Snapshot>> {
  const paths = new Set(mutations.flatMap(({ beforePath, afterPath }) => [beforePath, afterPath].filter((value): value is string => value !== undefined)));
  return new Map(await Promise.all([...paths].map(async (filePath) => [filePath, await snapshot(root, filePath)] as const)));
}

export function buildDiffPayload(
  root: string,
  mutations: FileMutation[],
  before: Map<string, Snapshot>,
  after: Map<string, Snapshot>,
): DiffPayload {
  const files: DiffFileSummary[] = [];
  const patches: string[] = [];

  for (const mutation of mutations) {
    const beforePath = mutation.beforePath;
    const afterPath = mutation.afterPath;
    const oldState = beforePath ? before.get(beforePath) ?? missingSnapshot : missingSnapshot;
    const newState = afterPath ? after.get(afterPath) ?? missingSnapshot : missingSnapshot;
    if (!oldState.exists && !newState.exists) continue;

    const oldDisplay = beforePath ? displayPath(root, beforePath) : undefined;
    const newDisplay = afterPath ? displayPath(root, afterPath) : undefined;
    const status = !oldState.exists
      ? "created"
      : !newState.exists
        ? "deleted"
        : oldDisplay !== newDisplay
          ? "renamed"
          : "modified";
    const { additions, deletions } = changeCounts(oldState.content, newState.content);
    const pathLabel = newDisplay ?? oldDisplay ?? "file";

    files.push({
      path: pathLabel,
      ...(oldDisplay ? { oldPath: oldDisplay } : {}),
      ...(newDisplay ? { newPath: newDisplay } : {}),
      status,
      additions,
      deletions,
    });

    patches.push(createTwoFilesPatch(
      oldState.exists && oldDisplay ? `a/${oldDisplay}` : "/dev/null",
      newState.exists && newDisplay ? `b/${newDisplay}` : "/dev/null",
      oldState.content,
      newState.content,
      "",
      "",
      { context: 3 },
    ).trimEnd());
  }

  return {
    patch: patches.filter(Boolean).join("\n"),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

export function extractPatchMutations(patchText: string): FileMutation[] {
  const mutations: FileMutation[] = [];
  let current: FileMutation | undefined;

  for (const line of patchText.split(/\r?\n/)) {
    let match = /^\s*\*\*\* Add File: (.+?)\s*$/.exec(line);
    if (match) {
      current = { afterPath: match[1]! };
      mutations.push(current);
      continue;
    }
    match = /^\s*\*\*\* Delete File: (.+?)\s*$/.exec(line);
    if (match) {
      current = { beforePath: match[1]! };
      mutations.push(current);
      continue;
    }
    match = /^\s*\*\*\* Update File: (.+?)\s*$/.exec(line);
    if (match) {
      current = { beforePath: match[1]!, afterPath: match[1]! };
      mutations.push(current);
      continue;
    }
    match = /^\s*\*\*\* Move to: (.+?)\s*$/.exec(line);
    if (match && current?.beforePath) current.afterPath = match[1]!;
  }

  return mutations;
}

async function snapshot(root: string, filePath: string): Promise<Snapshot> {
  const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  try {
    return { exists: true, content: await readFile(target, "utf8") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return missingSnapshot;
    throw error;
  }
}

function displayPath(root: string, filePath: string): string {
  const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return (relative || path.basename(target)).split(path.sep).join("/");
  }
  return target.split(path.sep).join("/");
}

function changeCounts(before: string, after: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const part of diffLines(before, after)) {
    if (part.added) additions += countLines(part.value);
    if (part.removed) deletions += countLines(part.value);
  }
  return { additions, deletions };
}

function countLines(value: string): number {
  if (!value) return 0;
  const parts = value.split(/\r\n|\r|\n/);
  return parts.length - (parts.at(-1) === "" ? 1 : 0);
}

const missingSnapshot: Snapshot = { exists: false, content: "" };
