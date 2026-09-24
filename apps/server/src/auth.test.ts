import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAuth } from "./auth.ts";
import { loadOrCreateAuthIdentity } from "./auth-store.ts";
import { getProfileTool } from "./tools/get-profile.ts";

test("auth identity and session survive a server restart", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rce-auth-test-"));
  try {
    const identityFile = path.join(directory, "auth.json");
    const databaseFile = path.join(directory, "auth.sqlite");
    const firstIdentity = await loadOrCreateAuthIdentity(identityFile);
    const first = await createAuth("http://127.0.0.1:6767", firstIdentity, databaseFile);
    const response = await first.auth.handler(new Request("http://127.0.0.1:6767/sign-in/anonymous", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:6767" },
      body: "{}",
    }));
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);

    const secondIdentity = await loadOrCreateAuthIdentity(identityFile);
    assert.deepEqual(secondIdentity, firstIdentity);
    const second = await createAuth("http://127.0.0.1:6767", secondIdentity, databaseFile);
    const session = await second.auth.handler(new Request("http://127.0.0.1:6767/get-session", {
      headers: { cookie },
    }));
    assert.equal(session.status, 200);
    assert.ok((await session.json() as { user?: unknown }).user);
    assert.equal(JSON.parse(await readFile(identityFile, "utf8")).profileId, firstIdentity.profileId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("profile tool publishes and returns the stable identity", async () => {
  let config: any;
  let handler: any;
  getProfileTool.register({ registerTool(_name: string, toolConfig: unknown, toolHandler: unknown) {
    config = toolConfig;
    handler = toolHandler;
  } } as any, { profileId: "a875638d-6450-43e0-a514-c3e32da61f99" } as any);
  assert.equal(config._meta["openai/profile"], true);
  assert.deepEqual((await handler({}, {})).structuredContent, {
    id: "a875638d-6450-43e0-a514-c3e32da61f99",
    name: "RCE",
  });
});
