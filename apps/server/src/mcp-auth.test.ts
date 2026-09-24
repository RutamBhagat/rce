import assert from "node:assert/strict";
import test from "node:test";
import { mcpAuthInfo } from "./mcp-auth.ts";

const resource = new URL("https://rce.example.com/mcp");
const secret = "a-persisted-secret-with-more-than-32-characters";

test("MCP auth context derives profile identity from the verified token subject", () => {
  const request = new Request(resource, { headers: { authorization: "Bearer access-token" } });
  const first = mcpAuthInfo(request, {
    sub: "user-a",
    azp: "client-a",
    scope: "mcp:tools offline_access",
    exp: 1234,
  }, resource, secret);
  const same = mcpAuthInfo(request, { sub: "user-a", azp: "client-a", scope: "mcp:tools" }, resource, secret);
  const other = mcpAuthInfo(request, { sub: "user-b", azp: "client-a", scope: "mcp:tools" }, resource, secret);

  assert.equal(first.token, "access-token");
  assert.equal(first.clientId, "client-a");
  assert.deepEqual(first.scopes, ["mcp:tools", "offline_access"]);
  assert.equal(first.extra?.profileId, same.extra?.profileId);
  assert.notEqual(first.extra?.profileId, other.extra?.profileId);
});

test("MCP auth context rejects a verified token without a subject", () => {
  const request = new Request(resource, { headers: { authorization: "Bearer access-token" } });
  assert.throws(() => mcpAuthInfo(request, { azp: "client-a", scope: "mcp:tools" }, resource, secret),
    /missing required identity claims/);
});
