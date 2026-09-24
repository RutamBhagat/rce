import type { AuthInfo } from "@modelcontextprotocol/server";
import { profileIdForSubject } from "./auth-store.ts";

type AccessTokenClaims = {
  sub?: unknown;
  client_id?: unknown;
  azp?: unknown;
  scope?: unknown;
  exp?: number;
};

export function mcpAuthInfo(
  request: Request,
  claims: AccessTokenClaims,
  resource: URL,
  secret: string,
): AuthInfo {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const clientId = typeof claims.client_id === "string" ? claims.client_id : claims.azp;
  const scopes = typeof claims.scope === "string"
    ? claims.scope.split(/\s+/).filter(Boolean)
    : Array.isArray(claims.scope) ? claims.scope.filter((scope): scope is string => typeof scope === "string") : [];
  if (!token || typeof clientId !== "string" || typeof claims.sub !== "string") {
    throw new Error("Verified access token is missing required identity claims");
  }
  return {
    token,
    clientId,
    scopes,
    expiresAt: claims.exp,
    resource,
    extra: { profileId: profileIdForSubject(secret, claims.sub) },
  };
}
