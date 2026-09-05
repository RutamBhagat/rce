import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { spawnSync } from "node:child_process";
import { registerPiTools } from "./pi-tools.ts";
import { registerProcessTools } from "./process-tools.ts";

const hasHerdr = spawnSync("herdr", ["--version"]).status === 0;

export const mcp = createMcpHandler(() => {
  const server = new McpServer({ name: "rce", version: "0.1.0" });
  if (hasHerdr) registerProcessTools(server);
  registerPiTools(server);
  return server;
}, { legacy: "reject" });
