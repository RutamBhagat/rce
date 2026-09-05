#!/usr/bin/env node
import { node } from "@elysia/node";
import { requireMcpAuth } from "@better-auth/mcp";
import { hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { env } from "@rce/env/server";
import { Elysia, t } from "elysia";
import { randomBytes } from "node:crypto";
import { auth, issuer, resource, SCOPE } from "./auth.ts";
import { consentHeaders, consentPage } from "./consent.ts";
import { log } from "./logger.ts";
import { mcp } from "./mcp.ts";
import { consentBody, consentQuery } from "./oauth-schemas.ts";
import { ROOT } from "./root.ts";

const approvalCode = randomBytes(32).toString("hex").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
const allowedHostnames = [issuer.hostname, "localhost", "127.0.0.1", "[::1]"];
const protectedMcp = requireMcpAuth(auth, (request) => mcp.fetch(request), {
  resource: resource.href,
  requiredScopes: [SCOPE],
});
const started = new WeakMap<Request, number>();

new Elysia({ adapter: node() })
  .onRequest(({ request }) => {
    started.set(request, performance.now());
    const url = new URL(request.url);
    const referer = request.headers.get("referer");
    const refererUrl = referer && URL.canParse(referer) ? new URL(referer) : undefined;
    log.info({
      component: "http",
      method: request.method,
      path: url.pathname,
      origin: request.headers.get("origin") ?? undefined,
      referer: refererUrl ? `${refererUrl.origin}${refererUrl.pathname}` : undefined,
    }, "http.request");
    return hostHeaderValidationResponse(request, allowedHostnames);
  })
  .onAfterResponse(({ request, responseValue, set }) => {
    const url = new URL(request.url);
    log.info({
      component: "http",
      method: request.method,
      path: url.pathname,
      status: responseValue instanceof Response ? responseValue.status : set.status ?? 200,
      ms: Math.round((performance.now() - (started.get(request) ?? performance.now())) * 10) / 10,
    }, "http.response");
  })
  .onError(({ request, error, code, set }) => {
    log.error({
      component: "http",
      method: request.method,
      path: new URL(request.url).pathname,
      status: set.status,
      code,
      err: error,
    }, "http.error");
  })
  .get("/", () => "OK")
  .get("/login", async ({ request, status }) => {
    const oauthQuery = new URL(request.url).search.slice(1);
    if (!oauthQuery) return status(400, "Invalid authorization request.");
    log.info({ component: "oauth", phase: "login.bridge", hasOauthQuery: true }, "oauth.login");
    const headers = new Headers(request.headers);
    headers.set("Accept", "text/html");
    headers.set("Content-Type", "application/json");
    headers.set("Origin", issuer.origin);
    headers.set("Referer", issuer.href);
    headers.set("Sec-Fetch-Mode", "navigate");
    headers.set("Sec-Fetch-Site", "same-origin");
    const response = await auth.handler(new Request(new URL("/sign-in/anonymous", issuer).href, {
      method: "POST",
      headers,
      body: JSON.stringify({ oauth_query: oauthQuery }),
    }));
    const location = response.headers.get("location");
    log.info({
      component: "oauth",
      phase: "login.result",
      status: response.status,
      redirectPath: location ? new URL(location, issuer).pathname : undefined,
    }, "oauth.login");
    return response;
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
    log.info({ component: "oauth", phase: "consent.submit", decision: params.decision }, "oauth.consent");
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");
    const response = await auth.handler(new Request(new URL("/oauth2/consent", issuer).href, {
      method: "POST",
      headers,
      body: JSON.stringify({ accept: params.decision === "approve", oauth_query: body.oauth_query }),
    }));
    if (!response.ok) {
      log.warn({ component: "oauth", phase: "consent.failed", status: response.status }, "oauth.consent");
      return response;
    }
    const result = await response.json() as { url: string };
    const target = new URL(result.url, issuer);
    log.info({
      component: "oauth",
      phase: "consent.redirect",
      status: response.status,
      redirectOrigin: target.origin,
      redirectPath: target.pathname,
      hasCode: target.searchParams.has("code"),
      hasState: target.searchParams.has("state"),
      error: target.searchParams.get("error") ?? undefined,
    }, "oauth.consent");
    return redirect(result.url, 302);
  }, {
    body: consentBody,
    params: t.Object({ decision: t.Union([t.Literal("approve"), t.Literal("deny")]) }),
  })
  .post("/mcp", ({ request }) =>
    originValidationResponse(request, allowedHostnames) ?? protectedMcp(request))
  .all("/mcp", ({ set, status }) => {
    set.headers.Allow = "POST";
    return status(405);
  })
  .mount(auth.handler)
  .listen({ port: env.PORT, hostname: "127.0.0.1" }, () => {
    log.info({ root: ROOT, url: `http://127.0.0.1:${env.PORT}/mcp`, approvalCode }, "server.ready");
  });
