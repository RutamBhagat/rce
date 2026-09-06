import { parseArgs } from "node:util";

const DEFAULT_PORT = 6767;

export type RceConfig = {
  origin: string;
  port: number;
};

export const HELP_TEXT = `Usage: rce [options]

Expose the current directory through an OAuth-protected MCP server.

Options:
  -o, --origin <url>  Public origin used by the MCP client.
                      Defaults to http://127.0.0.1:<port>.
  -p, --port <port>   Local loopback port. Defaults to 6767.
  -h, --help          Show this help.

Environment overrides:
  RCE_ORIGIN          Same as --origin (CLI flag wins).
  PORT                Same as --port (CLI flag wins).

Examples:
  rce
  rce --port 7000
  rce --origin https://rce.example.com
`;

function envValue(name: "PORT" | "RCE_ORIGIN"): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function parsePort(value: string | undefined): number {
  const raw = value ?? envValue("PORT") ?? String(DEFAULT_PORT);
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid port: ${raw}`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port must be an integer between 1 and 65535: ${raw}`);
  }
  return port;
}

function parseOrigin(value: string | undefined, port: number): string {
  const raw = value ?? envValue("RCE_ORIGIN") ?? `http://127.0.0.1:${port}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid origin URL: ${raw}`);
  }

  const isLocalHttp = url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const valid = !url.username
    && !url.password
    && !url.search
    && !url.hash
    && url.pathname === "/"
    && (url.protocol === "https:" || isLocalHttp);

  if (!valid) {
    throw new Error("Origin must be an HTTPS origin or a local HTTP origin with no path, query, hash, or credentials.");
  }
  return url.origin;
}

export function parseCli(args = process.argv.slice(2)):
  | { help: true }
  | { help: false; config: RceConfig } {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      origin: { type: "string", short: "o" },
      port: { type: "string", short: "p" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (positionals.length > 0) {
    throw new Error(`Unexpected argument: ${positionals[0]}`);
  }
  if (values.help) return { help: true };

  const port = parsePort(values.port);
  return {
    help: false,
    config: {
      port,
      origin: parseOrigin(values.origin, port),
    },
  };
}
