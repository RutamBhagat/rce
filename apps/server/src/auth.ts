import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { anonymous, jwt } from "better-auth/plugins";
import { DatabaseSync } from "node:sqlite";
import { AUTH_DATABASE, type AuthIdentity } from "./auth-store.ts";
import { log } from "./logger.ts";

export const SCOPE = "mcp:tools";

export async function createAuth(origin: string, identity: AuthIdentity, databaseFile = AUTH_DATABASE): Promise<{
  auth: any;
  issuer: URL;
  resource: URL;
}> {
  const issuer = new URL(origin);
  const resource = new URL("/mcp", issuer);

  const options = {
    baseURL: issuer.origin,
    basePath: "/",
    secret: identity.secret,
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
        refreshTokenExpiresIn: 30 * 24 * 60 * 60,
        codeExpiresIn: 5 * 60,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  };
  const database = new DatabaseSync(databaseFile);
  const authOptions = { ...options, database };
  const version = (database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version < 1) {
    const { runMigrations } = await getMigrations(authOptions);
    await runMigrations();
    database.exec("PRAGMA user_version = 1");
  }
  const auth = betterAuth(authOptions);
  return { auth, issuer, resource };
}
