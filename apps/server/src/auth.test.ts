import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAuth } from "./auth.ts";
import { loadOrCreateAuthIdentity, profileIdForSubject } from "./auth-store.ts";
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
    assert.equal((await stat(databaseFile)).mode & 0o777, 0o600);

    await chmod(databaseFile, 0o644);
    await createAuth("http://127.0.0.1:6767", secondIdentity, databaseFile);
    assert.equal((await stat(databaseFile)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("profile identity is stable per authenticated subject and distinct between subjects", () => {
  const secret = "a-persisted-secret-with-more-than-32-characters";
  assert.equal(profileIdForSubject(secret, "user-a"), profileIdForSubject(secret, "user-a"));
  assert.notEqual(profileIdForSubject(secret, "user-a"), profileIdForSubject(secret, "user-b"));
});

test("profile tool publishes and returns the credential-derived identity", async () => {
  let config: any;
  let handler: any;
  getProfileTool.register({ registerTool(_name: string, toolConfig: unknown, toolHandler: unknown) {
    config = toolConfig;
    handler = toolHandler;
  } } as any, {} as any);
  assert.equal(config._meta["openai/profile"], true);
  assert.deepEqual((await handler({}, { http: { authInfo: { extra: { profileId: "rce_profile_a" } } } })).structuredContent, {
    id: "rce_profile_a",
    name: "RCE",
  });
});
