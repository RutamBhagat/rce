import { parsePatchFiles } from "@pierre/diffs";
import assert from "node:assert/strict";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildDiffPayload,
  extractPatchMutations,
  snapshotMutations,
  type FileMutation,
} from "./tools/file-diff.ts";

test("extractPatchMutations supports add/delete/update/move", () => {
  const mutations = extractPatchMutations(`*** Begin Patch
*** Add File: added.ts
+new
*** Delete File: deleted.ts
*** Update File: old.ts
*** Move to: renamed.ts
@@
-old
+new
*** End Patch`);

  assert.deepEqual(mutations, [
    { afterPath: "added.ts" },
    { beforePath: "deleted.ts" },
    { beforePath: "old.ts", afterPath: "renamed.ts" },
  ]);
});

test("buildDiffPayload captures multi-file create/delete/rename/modify diffs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rce-diff-"));
  try {
    await writeFile(path.join(root, "modify.ts"), "const value = 1;\n");
    await writeFile(path.join(root, "delete.ts"), "delete me\n");
    await writeFile(path.join(root, "old-name.ts"), "same contents\n");

    const mutations: FileMutation[] = [
      { beforePath: "modify.ts", afterPath: "modify.ts" },
      { afterPath: "create.ts" },
      { beforePath: "delete.ts" },
      { beforePath: "old-name.ts", afterPath: "new-name.ts" },
    ];
    const before = await snapshotMutations(root, mutations);

    await writeFile(path.join(root, "modify.ts"), "const value = 2;\nconst extra = true;\n");
    await writeFile(path.join(root, "create.ts"), "created\n");
    await rm(path.join(root, "delete.ts"));
    await rename(path.join(root, "old-name.ts"), path.join(root, "new-name.ts"));

    const after = await snapshotMutations(root, mutations);
    const diff = buildDiffPayload(root, mutations, before, after);

    assert.deepEqual(diff.files.map(({ path: filePath, status }) => [filePath, status]), [
      ["modify.ts", "modified"],
      ["create.ts", "created"],
      ["delete.ts", "deleted"],
      ["new-name.ts", "renamed"],
    ]);
    assert.equal(diff.files[3]?.additions, 0);
    assert.equal(diff.files[3]?.deletions, 0);
    assert.equal(parsePatchFiles(diff.patch).flatMap((patch) => patch.files).length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
