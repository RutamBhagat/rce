import type { McpConfig, ServerDefinition } from "pi-mcp-adapter/types";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const codexEntrypoint = require.resolve("@openai/codex/bin/codex.js");
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

type CodexMcpEntry = {
  name: string;
  enabled?: boolean;
  transport?:
    | {
        type: "stdio";
        command: string;
        args?: string[] | null;
        env?: Record<string, string> | null;
        cwd?: string | null;
      }
    | {
        type: "streamable_http" | "sse";
        url: string;
        bearer_token_env_var?: string | null;
        http_headers?: Record<string, string> | null;
        env_http_headers?: Record<string, string> | null;
      };
};

export async function loadCodexMcpConfig(root: string): Promise<McpConfig> {
  const entries = await listCodexMcpServers(root);
  const mcpServers: Record<string, ServerDefinition> = {};

  for (const entry of entries) {
    const definition = toServerDefinition(root, entry);
    if (definition) mcpServers[entry.name] = definition;
  }

  return {
    mcpServers,
    settings: {
      directTools: true,
      disableProxyTool: true,
      scriptMode: false,
      sampling: false,
      elicitation: true,
      outputGuard: true,
    },
  };
}

async function listCodexMcpServers(root: string): Promise<CodexMcpEntry[]> {
  const child = spawn(process.execPath, [codexEntrypoint, "mcp", "list", "--json"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stdoutBytes = 0;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBytes += Buffer.byteLength(chunk);
    if (stdoutBytes > MAX_OUTPUT_BYTES) {
      child.kill();
      return;
    }
    stdout += chunk;
  });

  // Drain stderr, but never retain it: Codex MCP configuration can contain secrets.
  child.stderr.resume();

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (stdoutBytes > MAX_OUTPUT_BYTES) throw new Error("Codex MCP inventory exceeded the output limit");
  if (code !== 0) throw new Error(`Codex MCP inventory failed with exit code ${String(code)}`);

  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error("Codex MCP inventory returned an unexpected payload");
  return parsed.filter(isCodexMcpEntry);
}

function isCodexMcpEntry(value: unknown): value is CodexMcpEntry {
  return !!value && typeof value === "object" && typeof (value as CodexMcpEntry).name === "string";
}

function toServerDefinition(root: string, entry: CodexMcpEntry): ServerDefinition | null {
  const transport = entry.transport;
  if (!transport) return null;

  const common = {
    directTools: true as const,
    disabled: entry.enabled === false,
    // Eager discovery populates pi-mcp-adapter's metadata cache once. Subsequent
    // RCE starts can register direct tools from cache without a discovery hop.
    lifecycle: entry.enabled === false ? "lazy" as const : "eager" as const,
  };

  if (transport.type === "stdio") {
    return {
      ...common,
      command: transport.command,
      ...(transport.args ? { args: transport.args } : {}),
      ...(transport.env ? { env: transport.env, literalEnv: true } : {}),
      ...(transport.cwd ? { cwd: path.isAbsolute(transport.cwd) ? transport.cwd : path.resolve(root, transport.cwd) } : {}),
    };
  }

  if (transport.type === "streamable_http" || transport.type === "sse") {
    const headers = {
      ...(transport.http_headers ?? {}),
      ...resolveEnvHeaders(transport.env_http_headers),
    };
    return {
      ...common,
      url: transport.url,
      httpTransport: transport.type === "sse" ? "sse" : "streamable-http",
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(transport.bearer_token_env_var
        ? { auth: "bearer" as const, bearerTokenEnv: transport.bearer_token_env_var }
        : {}),
    };
  }

  return null;
}

function resolveEnvHeaders(headers: Record<string, string> | null | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).flatMap(([header, envName]) => {
      const value = process.env[envName];
      return value === undefined ? [] : [[header, value]];
    }),
  );
}
