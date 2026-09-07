import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyCodexPatch } from "./tools/apply-patch.ts";

test("applyCodexPatch follows the bundled Codex patch contract", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rce-apply-patch-"));
  try {
    await writeFile(path.join(root, "alpha.txt"), "one\ntwo\nthree\n");

    await applyCodexPatch(root, `*** Begin Patch
*** Update File: alpha.txt
*** Move to: beta.txt
@@
 one
-two
+TWO
 three
*** Add File: created.txt
+hello
+world
*** End Patch`);

    assert.equal(await readFile(path.join(root, "beta.txt"), "utf8"), "one\nTWO\nthree\n");
    assert.equal(await readFile(path.join(root, "created.txt"), "utf8"), "hello\nworld\n");

    await applyCodexPatch(root, `*** Begin Patch
*** Delete File: created.txt
*** End Patch`);
    await assert.rejects(readFile(path.join(root, "created.txt"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applyCodexPatch rejects absolute patch paths before Codex runs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rce-apply-patch-"));
  try {
    const absolute = path.join(root, "outside.txt");
    await assert.rejects(
      applyCodexPatch(root, `*** Begin Patch
*** Add File: ${absolute}
+nope
*** End Patch`),
      /Patch paths must be relative to the RCE root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
