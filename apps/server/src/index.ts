#!/usr/bin/env node
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { env } from "@rce/env/server";
import type { RequestHandler } from "express";
import Provider, { errors } from "oidc-provider";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { consentHeaders, consentPage } from "./consent.ts";
import { mcp } from "./mcp.ts";
import { ROOT } from "./root.ts";
import { authorizationParams } from "./schemas.ts";

const SCOPE = "mcp:tools";
const issuer = new URL(env.RCE_ORIGIN);
const resource = new URL("/mcp", issuer);
const resourceMetadata = new URL("/.well-known/oauth-protected-resource/mcp", issuer);
const allowedHostnames = [issuer.hostname, "localhost", "127.0.0.1", "[::1]"];
const approvalCode = randomBytes(32).toString("hex").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
const trace = (event: string, details: Record<string, unknown> = {}) =>
  console.log(`[oauth] ${event}`, details);
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const signingKey = Object.assign(privateKey.export({ format: "jwk" }), {
  alg: "RS256",
  kid: randomUUID(),
  use: "sig",
});

const oauth = new Provider(issuer.href, {
  clientAuthMethods: ["private_key_jwt", "none"],
  cookies: { keys: [randomBytes(32).toString("base64url")] },
  features: {
    clientIdMetadataDocument: { enabled: true, ack: "draft-02" },
    devInteractions: { enabled: false },
    dPoP: { enabled: false },
    pushedAuthorizationRequests: { enabled: false },
    resourceIndicators: {
      enabled: true,
      getResourceServerInfo: (_ctx, indicator) => {
        if (indicator !== resource.href) throw new errors.InvalidTarget();
        return { audience: resource.href, scope: SCOPE, accessTokenTTL: 8 * 60 * 60 };
      },
      useGrantedResource: () => true,
    },
    revocation: { enabled: true },
    rpInitiatedLogout: { enabled: false },
    userinfo: { enabled: false },
  },
  findAccount: async (_ctx, id) => id === "owner" ? {
    accountId: id,
    claims: async () => ({ sub: id }),
  } : undefined,
  interactions: { url: (_ctx, interaction) => `/consent/${interaction.uid}` },
  jwks: { keys: [signingKey] },
  pkce: { required: () => true },
  responseTypes: ["code"],
  routes: { authorization: "/authorize", revocation: "/revoke", token: "/token" },
  scopes: ["offline_access"],
  ttl: {
    AccessToken: 8 * 60 * 60,
    AuthorizationCode: 5 * 60,
    Grant: 8 * 60 * 60,
    Interaction: 5 * 60,
    Session: 8 * 60 * 60,
  },
});
oauth.proxy = true;

oauth.on("authorization.accepted", (ctx) => {
  const params = ctx.oidc.params;
  trace("authorization.accepted", {
    client_id: params?.client_id,
    redirect_uri: params?.redirect_uri,
    response_type: params?.response_type,
    scope: params?.scope,
    resource: params?.resource,
    prompt: params?.prompt,
    code_challenge_method: params?.code_challenge_method,
    state: params?.state !== undefined,
  });
});
oauth.on("interaction.started", (ctx, prompt) => trace("interaction.started", {
  client_id: ctx.oidc.params?.client_id,
  prompt: prompt.name,
  reasons: prompt.reasons,
  scope: ctx.oidc.params?.scope,
  resource: ctx.oidc.params?.resource,
}));
oauth.on("interaction.ended", (ctx) => trace("interaction.ended", {
  client_id: ctx.oidc.params?.client_id,
}));
oauth.on("authorization.success", (ctx) => trace("authorization.success", {
  client_id: ctx.oidc.params?.client_id,
}));
oauth.on("authorization.error", (ctx, error) => trace("authorization.error", {
  client_id: ctx.oidc.params?.client_id,
  error: error.error ?? error.name,
  description: error.error_description ?? error.message,
}));
oauth.on("grant.success", (ctx) => trace("grant.success", {
  grant_type: ctx.oidc.params?.grant_type,
  client_id: ctx.oidc.client?.clientId,
  client_auth: ctx.oidc.client?.clientAuthMethod,
  scope: ctx.oidc.params?.scope,
  resource: ctx.oidc.params?.resource,
  client_assertion: ctx.oidc.params?.client_assertion !== undefined,
}));
oauth.on("grant.error", (ctx, error) => trace("grant.error", {
  grant_type: ctx.oidc.params?.grant_type,
  client_id: ctx.oidc.client?.clientId,
  client_auth: ctx.oidc.client?.clientAuthMethod,
  error: error.error ?? error.name,
  description: error.error_description ?? error.message,
  client_assertion: ctx.oidc.params?.client_assertion !== undefined,
}));
oauth.on("authorization_code.saved", () => trace("authorization_code.saved"));
oauth.on("authorization_code.consumed", () => trace("authorization_code.consumed"));
oauth.on("access_token.saved", () => trace("access_token.saved"));
oauth.on("refresh_token.saved", () => trace("refresh_token.saved"));
oauth.on("refresh_token.consumed", () => trace("refresh_token.consumed"));
oauth.on("server_error", (_ctx, error) => trace("server_error", {
  error: error.name,
  description: error.message,
}));

const sameOrigin: RequestHandler = (req, res, next) => {
  if (req.get("origin") !== issuer.origin) {
    res.sendStatus(403);
    return;
  }
  next();
};

const requireMcpAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.get("authorization");
  const value = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const token = value ? await oauth.AccessToken.find(value) : undefined;
  const audience = token?.aud;
  const validAudience = typeof audience === "string"
    ? audience === resource.href
    : Array.isArray(audience) && audience.includes(resource.href);
  if (!token || !token.scopes.has(SCOPE) || !validAudience) {
    console.log("[mcp] auth.rejected", {
      token_found: Boolean(token),
      scope_ok: Boolean(token?.scopes.has(SCOPE)),
      audience_ok: validAudience,
    });
    res
      .set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadata.href}", scope="${SCOPE}"`)
      .status(401)
      .json({ error: "invalid_token" });
    return;
  }
  console.log("[mcp] auth.accepted");
  next();
};

const app = createMcpExpressApp({ allowedHosts: allowedHostnames, allowedOrigins: allowedHostnames });
app.set("trust proxy", "loopback");

app.use((req, res, next) => {
  const path = req.path
    .replace(/^\/consent\/[^/]+/, "/consent/:uid")
    .replace(/^\/authorize\/[^/]+/, "/authorize/:uid");
  if (path === "/authorize" || path.startsWith("/authorize/") || path.startsWith("/consent/") ||
      path === "/token" || path === "/mcp" || path.startsWith("/.well-known/")) {
    const started = Date.now();
    res.on("finish", () => console.log("[http]", {
      method: req.method,
      path,
      status: res.statusCode,
      ms: Date.now() - started,
      origin: req.get("origin") ?? null,
    }));
  }
  next();
});

app.get(resourceMetadata.pathname, (_req, res) => void res.json({
  resource: resource.href,
  authorization_servers: [issuer.href],
  scopes_supported: [SCOPE],
  resource_name: "RCE",
}));

app.get("/consent/:uid", async (req, res, next) => {
  try {
    const details = await oauth.interactionDetails(req, res);
    const parsed = authorizationParams.safeParse(details.params);
    if (!parsed.success) return void res.status(400).send("Invalid authorization request.");
    const { client_id: clientId, redirect_uri: redirectUri } = parsed.data;
    const client = await oauth.Client.find(clientId);
    if (!client) return void res.status(400).send("Invalid authorization request.");

    res
      .set(consentHeaders)
      .type("html")
      .send(String(consentPage({
        clientName: client.clientName ?? clientId,
        directory: ROOT,
        redirectUri,
        approvalCode,
        action: `/consent/${req.params.uid}`,
        fields: [],
      })));
  } catch (error) {
    next(error);
  }
});

app.post("/consent/:uid/approve", sameOrigin, async (req, res, next) => {
  try {
    const details = await oauth.interactionDetails(req, res);
    const clientId = details.params.client_id;
    if (typeof clientId !== "string") return void res.status(400).send("Invalid authorization request.");
    trace("consent.approve", {
      client_id: clientId,
      scope: details.params.scope,
      resource: details.params.resource,
      prompt: details.params.prompt,
    });
    const grant = new oauth.Grant({ clientId, accountId: "owner" });
    if (typeof details.params.scope === "string") {
      const requestedScopes = details.params.scope.split(" ");
      if (requestedScopes.includes("openid")) grant.addOIDCScope("openid");
      if (requestedScopes.includes("offline_access")) grant.addOIDCScope("offline_access");
    }
    grant.addResourceScope(resource.href, SCOPE);
    const grantId = await grant.save();
    await oauth.interactionFinished(req, res, { login: { accountId: "owner" }, consent: { grantId } });
  } catch (error) {
    next(error);
  }
});

app.post("/consent/:uid/deny", sameOrigin, async (req, res, next) => {
  try {
    await oauth.interactionFinished(req, res, {
      error: "access_denied",
      error_description: "The owner denied access.",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => void res.send("OK"));
const nodeMcp = toNodeHandler(mcp);
app.post("/mcp", requireMcpAuth, (req, res) => void nodeMcp(req, res, req.body));
app.all("/mcp", (_req, res) => void res.set("Allow", "POST").sendStatus(405));
app.use(oauth.callback());

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`RCE serves ${ROOT} at http://127.0.0.1:${env.PORT}/mcp`);
  console.log(`Approval code: ${approvalCode}`);
});
