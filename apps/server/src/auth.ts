import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { env } from "@rce/env/server";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getAuthTables } from "better-auth/db";
import { anonymous, jwt } from "better-auth/plugins";
import { randomBytes } from "node:crypto";
import { log } from "./logger.ts";

export const SCOPE = "mcp:tools";
export const issuer = new URL(env.RCE_ORIGIN);
export const resource = new URL("/mcp", issuer);

const options = {
  baseURL: issuer.origin,
  basePath: "/",
  secret: randomBytes(32).toString("base64url"),
  trustedOrigins: [issuer.origin],
  session: { expiresIn: 8 * 60 * 60 },
  logger: {
    level: "debug" as const,
    log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
      const err = args.find((arg): arg is Error => arg instanceof Error);
      const details = { component: "better-auth", ...(err ? { err } : {}) };
      if (level === "error") log.error(details, message);
      else if (level === "warn") log.warn(details, message);
      else if (level === "info") log.info(details, message);
      else log.debug(details, message);
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!["/oauth2/authorize", "/sign-in/anonymous", "/oauth2/consent", "/oauth2/token"].includes(ctx.path)) return;
      const body = ctx.body as Record<string, unknown> | undefined;
      const query = ctx.query as Record<string, unknown> | undefined;
      log.info({
        component: "oauth",
        phase: "before",
        path: ctx.path,
        method: ctx.request?.method,
        clientId: query?.client_id ?? body?.client_id,
        redirectUri: query?.redirect_uri,
        responseType: query?.response_type,
        scope: query?.scope ?? body?.scope,
        resource: query?.resource ?? body?.resource,
        codeChallengeMethod: query?.code_challenge_method,
        grantType: body?.grant_type,
        clientAssertionType: body?.client_assertion_type,
        hasState: typeof query?.state === "string",
        hasCodeChallenge: typeof query?.code_challenge === "string",
        hasCode: typeof body?.code === "string",
        hasCodeVerifier: typeof body?.code_verifier === "string",
        hasClientAssertion: typeof body?.client_assertion === "string",
        hasRefreshToken: typeof body?.refresh_token === "string",
        hasOauthQuery: typeof body?.oauth_query === "string",
        consent: body?.accept,
      }, "oauth.step");
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!["/oauth2/authorize", "/sign-in/anonymous", "/oauth2/consent", "/oauth2/token"].includes(ctx.path)) return;
      const returned = ctx.context.returned;
      const data = returned && typeof returned === "object" ? returned as Record<string, unknown> : undefined;
      log.info({
        component: "oauth",
        phase: "after",
        path: ctx.path,
        status: returned instanceof Response ? returned.status : undefined,
        newSession: Boolean(ctx.context.newSession),
        accessTokenIssued: Boolean(data && "access_token" in data),
        refreshTokenIssued: Boolean(data && "refresh_token" in data),
      }, "oauth.step");
    }),
  },
  plugins: [
    anonymous(),
    jwt(),
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: resource.href,
      scopes: [SCOPE, "offline_access"],
      grantTypes: ["authorization_code", "refresh_token"],
      accessTokenExpiresIn: 8 * 60 * 60,
      refreshTokenExpiresIn: 8 * 60 * 60,
      codeExpiresIn: 5 * 60,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ],
};
const memory = Object.fromEntries(Object.keys(getAuthTables(options)).map((table) => [table, []]));

export const auth = betterAuth({ ...options, database: memoryAdapter(memory) });
