import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { env } from "@rce/env/server";
import { betterAuth } from "better-auth";
import { getAuthTables } from "better-auth/db";
import { anonymous, jwt } from "better-auth/plugins";
import { randomBytes } from "node:crypto";

export const SCOPE = "mcp:tools";
export const issuer = new URL(env.RCE_ORIGIN);
export const resource = new URL("/mcp", issuer);

const options = {
  baseURL: issuer.origin,
  basePath: "/",
  secret: randomBytes(32).toString("base64url"),
  trustedOrigins: [issuer.origin],
  session: { expiresIn: 8 * 60 * 60 },
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
