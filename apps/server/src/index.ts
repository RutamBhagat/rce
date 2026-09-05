#!/usr/bin/env node
import { node } from "@elysia/node";
import { requireMcpAuth } from "@better-auth/mcp";
import { hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { env } from "@rce/env/server";
import { Elysia, t } from "elysia";
import { randomBytes } from "node:crypto";
import { auth, issuer, resource, SCOPE } from "./auth.ts";
import { consentHeaders, consentPage } from "./consent.ts";
import { mcp } from "./mcp.ts";
import { consentBody, consentQuery } from "./oauth-schemas.ts";
import { ROOT } from "./root.ts";

const approvalCode = randomBytes(32).toString("hex").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
const allowedHostnames = [issuer.hostname, "localhost", "127.0.0.1", "[::1]"];
const protectedMcp = requireMcpAuth(auth, (request) => mcp.fetch(request), {
  resource: resource.href,
  requiredScopes: [SCOPE],
});

new Elysia({ adapter: node() })
  .onRequest(({ request }) =>
    hostHeaderValidationResponse(request, allowedHostnames) ?? originValidationResponse(request, allowedHostnames))
  .get("/", () => "OK")
  .get("/login", ({ request, status }) => {
    const oauthQuery = new URL(request.url).search.slice(1);
    if (!oauthQuery) return status(400, "Invalid authorization request.");
    const headers = new Headers(request.headers);
    headers.set("Accept", "text/html");
    headers.set("Content-Type", "application/json");
    headers.set("Sec-Fetch-Mode", "navigate");
    return auth.handler(new Request(new URL("/sign-in/anonymous", issuer).href, {
      method: "POST",
      headers,
      body: JSON.stringify({ oauth_query: oauthQuery }),
    }));
  })
  .get("/consent", ({ query, request }) => new Response(String(consentPage({
    clientName: query.client_id,
    directory: ROOT,
    redirectUri: query.redirect_uri,
    approvalCode,
    action: "/consent",
    fields: [["oauth_query", new URL(request.url).search.slice(1)]],
  })), { headers: { ...consentHeaders, "Content-Type": "text/html; charset=utf-8" } }), { query: consentQuery })
  .post("/consent/:decision", async ({ body, params, request, redirect }) => {
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    const response = await auth.handler(new Request(new URL("/oauth2/consent", issuer).href, {
      method: "POST",
      headers,
      body: JSON.stringify({ accept: params.decision === "approve", oauth_query: body.oauth_query }),
    }));
    if (!response.ok) return response;
    const result = await response.json() as { url: string };
    return redirect(result.url, 302);
  }, {
    body: consentBody,
    params: t.Object({ decision: t.Union([t.Literal("approve"), t.Literal("deny")]) }),
  })
  .post("/mcp", ({ request }) => protectedMcp(request))
  .all("/mcp", ({ set, status }) => {
    set.headers.Allow = "POST";
    return status(405);
  })
  .mount(auth.handler)
  .listen({ port: env.PORT, hostname: "127.0.0.1" }, () => {
    console.log(`RCE serves ${ROOT} at http://127.0.0.1:${env.PORT}/mcp`);
    console.log(`Approval code: ${approvalCode}`);
  });
