#!/usr/bin/env node
import { node } from "@elysia/node";
import { env } from "@rce/env/server";
import { Elysia, getSchemaValidator, t } from "elysia";
import Provider, { errors } from "oidc-provider";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mcp } from "./mcp.ts";
import { listen } from "./node-server.ts";
import { ROOT } from "./root.ts";

const SCOPE = "mcp:tools";
const issuer = new URL(env.RCE_ORIGIN);
const resource = new URL("/mcp", issuer);
const resourceMetadata = new URL("/.well-known/oauth-protected-resource/mcp", issuer);
const bearerAuthorization = getSchemaValidator(t.String({ pattern: "^Bearer .+$" }));
const resourceAudience = getSchemaValidator(t.Union([
  t.Literal(resource.href),
  t.Array(t.String(), { contains: t.Literal(resource.href) }),
]));
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

const app = new Elysia({ adapter: node() })
  .get(resourceMetadata.pathname, () => ({
    resource: resource.href,
    authorization_servers: [issuer.href],
    scopes_supported: [SCOPE],
    resource_name: "RCE",
  }))
  .get("/", () => "OK")
  .post("/mcp", async ({ request, set, status }) => {
    const authorization = bearerAuthorization.safeParse(request.headers.get("authorization"));
    const token = authorization.success
      ? await oauth.AccessToken.find(authorization.data.slice(7))
      : undefined;
    const validAudience = resourceAudience.Check(token?.aud);
    if (!token || !token.scopes.has(SCOPE) || !validAudience) {
      console.log("[mcp] auth.rejected", {
        token_found: Boolean(token),
        scope_ok: Boolean(token?.scopes.has(SCOPE)),
        audience_ok: validAudience,
      });
      set.headers["WWW-Authenticate"] = `Bearer resource_metadata="${resourceMetadata.href}", scope="${SCOPE}"`;
      return status(401, { error: "invalid_token" });
    }
    console.log("[mcp] auth.accepted");
    return mcp.fetch(request);
  })
  .all("/mcp", ({ set, status }) => {
    set.headers.Allow = "POST";
    return status(405);
  });

listen({
  app,
  appPaths: ["/", resourceMetadata.pathname, "/mcp"],
  oauth,
  issuer,
  resource,
  scope: SCOPE,
  root: ROOT,
  approvalCode,
  port: env.PORT,
  trace,
}).on("listening", () => {
  console.log(`RCE serves ${ROOT} at http://127.0.0.1:${env.PORT}/mcp`);
  console.log(`Approval code: ${approvalCode}`);
});
