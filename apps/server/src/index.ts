#!/usr/bin/env bun
import { toNodeHandler } from "@modelcontextprotocol/node";
import { env } from "@rce/env/server";
import express from "express";
import validate, { type ErrorRequestHandler, type WeakRequestHandler } from "express-zod-safe";
import {
  authenticateHandler,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
  OAuthServer,
  redirectUriMatches,
  requireBearerAuth,
} from "mcp-oauth-server";
import { randomBytes } from "node:crypto";
import { secureCimdFetch } from "./cimd.ts";
import { consentHeaders, consentPage } from "./consent.ts";
import { mcp } from "./mcp.ts";
import { ROOT } from "./root.ts";
import { authorizationParams } from "./schemas.ts";

const SCOPE = "mcp:tools";
const issuer = new URL(env.RCE_ORIGIN);
const resource = new URL("/mcp", issuer);
const approvalCode = randomBytes(32).toString("hex").slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
const invalidAuthorization: ErrorRequestHandler = (_errors, _req, res) => {
  res.status(400).send("Invalid authorization request.");
};
const oauth = new OAuthServer({
  issuerUrl: issuer,
  authorizationUrl: new URL("/consent", issuer),
  resourceServerUrl: resource,
  scopesSupported: [SCOPE],
  accessTokenLifetime: 8 * 60 * 60,
  authorizationCodeLifetime: 5 * 60,
  strictResource: true,
  grantTypes: ["authorization_code"],
  dynamicClientRegistration: false,
  clientIdMetadataDocuments: { fetch: secureCimdFetch as typeof fetch, fetchTimeoutMs: 5_000 },
});

const sameOrigin: WeakRequestHandler = (req, res, next) => {
  if (req.get("origin") !== issuer.origin) {
    res.sendStatus(403);
    return;
  }
  next();
};

const app = express();
app.use(mcpAuthRouter({
  provider: oauth,
  resourceServerUrl: resource,
  scopesSupported: [SCOPE],
  resourceName: "RCE",
}));

app.get("/consent", validate({ query: authorizationParams, handler: invalidAuthorization }), async (req, res) => {
  const { client_id: clientId, redirect_uri: redirectUri } = req.query;
  const client = await oauth.getClient(clientId).catch(() => undefined);
  if (!client || !client.redirect_uris.some((registered) => redirectUriMatches(redirectUri, registered))) {
    return void res.status(400).send("Invalid authorization request.");
  }

  const fields = Object.entries(req.query)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  res
    .set(consentHeaders)
    .type("html")
    .send(String(consentPage({
      clientName: client.client_name ?? clientId,
      directory: ROOT,
      redirectUri,
      approvalCode,
      fields,
    })));
});

app.use("/consent/approve", sameOrigin, authenticateHandler({ provider: oauth, getUser: () => "owner" }));
app.post(
  "/consent/deny",
  sameOrigin,
  express.urlencoded({ extended: false }) as WeakRequestHandler,
  validate({ body: authorizationParams, handler: invalidAuthorization }),
  async (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, state } = req.body;
    const client = await oauth.getClient(clientId).catch(() => undefined);
    if (!client || !client.redirect_uris.some((registered) => redirectUriMatches(redirectUri, registered))) {
      return void res.status(400).send("Invalid authorization request.");
    }
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "The owner denied access.");
    url.searchParams.set("iss", issuer.href);
    if (state) url.searchParams.set("state", state);
    res.redirect(302, url.href);
  },
);

app.get("/", (_req, res) => void res.send("OK"));
const nodeMcp = toNodeHandler(mcp);
app.post(
  "/mcp",
  express.json(),
  requireBearerAuth({
    verifier: oauth,
    requiredScopes: [SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
    resource,
  }),
  (req, res) => void nodeMcp(req, res, req.body),
);
app.all("/mcp", (_req, res) => void res.set("Allow", "POST").sendStatus(405));

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`RCE serves ${ROOT} at http://127.0.0.1:${env.PORT}/mcp`);
  console.log(`Approval code: ${approvalCode}`);
});
