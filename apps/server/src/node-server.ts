import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import type Provider from "oidc-provider";
import { createServer } from "node:http";
import { consentHeaders, consentPage } from "./consent.ts";
import { authorizationParams } from "./oauth-schemas.ts";

type Options = {
  app: { fetch: (request: Request) => Response | Promise<Response> };
  appPaths: readonly string[];
  oauth: Provider;
  issuer: URL;
  resource: URL;
  scope: string;
  root: string;
  approvalCode: string;
  port: number;
  trace: (event: string, details?: Record<string, unknown>) => void;
};

const consentView = new URLPattern({ pathname: "/consent/:uid" });
const consentAction = new URLPattern({ pathname: "/consent/:uid/:action" });
const authorize = new URLPattern({ pathname: "/authorize/:uid" });

export function listen({ app, appPaths, oauth, issuer, resource, scope, root, approvalCode, port, trace }: Options) {
  const nodeApp = toNodeHandler({ fetch: async (request) => app.fetch(request) });
  const appPathSet = new Set(appPaths);
  const allowedHostnames = [issuer.hostname, "localhost", "127.0.0.1", "[::1]"];
  const validateHost = hostHeaderValidation(allowedHostnames);
  const validateOrigin = originValidation(allowedHostnames);
  const oauthHandler = oauth.callback();

  return createServer(async (req, res) => {
    try {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const view = consentView.exec(url);
      const action = consentAction.exec(url);
      const path = view ? "/consent/:uid"
        : action ? `/consent/:uid/${action.pathname.groups.action}`
          : authorize.test(url) ? "/authorize/:uid" : url.pathname;
      const started = Date.now();
      res.on("finish", () => console.log("[http]", {
        method: req.method,
        path,
        status: res.statusCode,
        ms: Date.now() - started,
        origin: req.headers.origin ?? null,
      }));

      if (view && req.method === "GET") {
        const details = await oauth.interactionDetails(req, res);
        const parsed = authorizationParams.safeParse(details.params);
        if (!parsed.success) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid authorization request.");
          return;
        }
        const { client_id: clientId, redirect_uri: redirectUri } = parsed.data;
        const client = await oauth.Client.find(clientId);
        if (!client) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid authorization request.");
          return;
        }
        res.writeHead(200, { ...consentHeaders, "Content-Type": "text/html; charset=utf-8" });
        res.end(String(consentPage({
          clientName: client.clientName ?? clientId,
          directory: root,
          redirectUri,
          approvalCode,
          action: url.pathname,
          fields: [],
        })));
        return;
      }

      const consentChoice = action?.pathname.groups.action;
      if (action && req.method === "POST" && (consentChoice === "approve" || consentChoice === "deny")) {
        if (req.headers.origin !== issuer.origin) {
          res.writeHead(403).end();
          return;
        }
        if (consentChoice === "deny") {
          await oauth.interactionFinished(req, res, {
            error: "access_denied",
            error_description: "The owner denied access.",
          });
          return;
        }
        const details = await oauth.interactionDetails(req, res);
        const parsed = authorizationParams.safeParse(details.params);
        if (!parsed.success) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid authorization request.");
          return;
        }
        const clientId = parsed.data.client_id;
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
        grant.addResourceScope(resource.href, scope);
        const grantId = await grant.save();
        await oauth.interactionFinished(req, res, { login: { accountId: "owner" }, consent: { grantId } });
        return;
      }

      if (appPathSet.has(url.pathname)) {
        await nodeApp(req, res);
        return;
      }
      oauthHandler(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  }).listen(port, "127.0.0.1");
}
