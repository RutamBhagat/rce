#!/usr/bin/env bun
import { ROOT } from "./root";

const { Elysia } = await import("elysia");
const { mcp } = await import("./mcp");

new Elysia()
  .get("/", () => "OK")
  .all("/mcp", ({ request }) => mcp.fetch(request))
  // Temporary local proof. Replace with OAuth before remote use.
  .listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3000) }, (server) => {
    console.log(`RCE serves ${ROOT} at http://127.0.0.1:${server.port}/mcp`);
  });
