import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getSchema } from "better-auth/db";
import { getMigrations } from "better-auth/db/migration";
import { anonymous, jwt } from "better-auth/plugins";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { AUTH_DATABASE, type AuthIdentity } from "./auth-store.ts";
import { log } from "./logger.ts";

export const SCOPE = "mcp:tools";

const AUTH_SCHEMA_KEY = "better-auth-schema";
const SQLITE_ARRAY_TYPE_WARNING = /^Field .+ in table .+ has a different type in the database\. Expected (?:string|number)\[\] but got TEXT\.$/;

function canonicalize(value: unknown): unknown {
  if (typeof value === "function") return "[function]";
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

function authSchemaFingerprint(options: any): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(getSchema(options)))).digest("hex");
}

export async function ensureAuthSchema(
  database: DatabaseSync,
  options: any,
  migrate?: () => Promise<void>,
): Promise<boolean> {
  database.exec("CREATE TABLE IF NOT EXISTS rceAuthMetadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const fingerprint = authSchemaFingerprint(options);
  const stored = database.prepare("SELECT value FROM rceAuthMetadata WHERE key = ?").get(AUTH_SCHEMA_KEY) as { value: string } | undefined;
  if (stored?.value === fingerprint) return false;

  if (migrate) await migrate();
  else {
    const configuredLogger = options.logger;
    const migrationOptions = {
      ...options,
      logger: {
        ...configuredLogger,
        log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
          // Better Auth stores array fields as TEXT on SQLite but 1.7.2 warns that
          // the resulting TEXT columns do not match its own string[]/number[] schema.
          if (level === "warn" && SQLITE_ARRAY_TYPE_WARNING.test(message)) return;
          configuredLogger?.log?.(level, message, ...args);
        },
      },
    };
    const { runMigrations } = await getMigrations(migrationOptions);
    await runMigrations();
  }

  database.prepare("INSERT OR REPLACE INTO rceAuthMetadata (key, value) VALUES (?, ?)").run(AUTH_SCHEMA_KEY, fingerprint);
  return true;
}

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
  await mkdir(path.dirname(databaseFile), { recursive: true, mode: 0o700 });
  const databaseHandle = await open(databaseFile, "a", 0o600);
  await databaseHandle.close();
  await chmod(databaseFile, 0o600);
  const database = new DatabaseSync(databaseFile);
  const authOptions = { ...options, database };
  await ensureAuthSchema(database, authOptions);
  const auth = betterAuth(authOptions);
  return { auth, issuer, resource };
}
