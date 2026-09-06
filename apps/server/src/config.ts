import { parseArgs } from "node:util";

export const DEFAULT_PORT = 6767;

export type RceConfig = {
  origin: string;
  port: number;
};

export type StoredConfig = Partial<RceConfig>;
export type ConfigKey = keyof RceConfig;

export type CliCommand =
  | { kind: "help" }
  | { kind: "serve"; origin?: string; port?: string; yes: boolean }
  | { kind: "init"; yes: boolean }
  | { kind: "config-get" }
  | { kind: "config-set"; key: ConfigKey; value: string }
  | { kind: "config-unset"; key: ConfigKey }
  | { kind: "config-reset" };

export const HELP_TEXT = `Usage: rce [command] [options]

Expose the current directory through an OAuth-protected MCP server.

Commands:
  init                         Run or redo interactive setup.
  config get                   Print saved configuration.
  config set <key> <value>     Persist origin or port.
  config unset <key>           Remove a saved value.
  config reset                 Remove all saved configuration.

Options:
  -o, --origin <url>            Public origin for this run.
  -p, --port <port>             Local loopback port for this run.
  -y, --yes                     Accept setup defaults without prompting.
  -h, --help                    Show this help.

Precedence:
  CLI flags > RCE_ORIGIN/PORT > saved config > defaults

Examples:
  rce
  rce init
  rce --origin https://rce.example.com
  rce --port 7000
  rce config set origin https://rce.example.com
  rce config set port 7000
`;

export function envValue(name: "PORT" | "RCE_ORIGIN"): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function parsePort(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid port: ${raw}`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port must be an integer between 1 and 65535: ${raw}`);
  }
  return port;
}

export function parseOrigin(raw: string): string {
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

export function defaultOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function completeStoredConfig(config: StoredConfig): RceConfig {
  const port = config.port ?? DEFAULT_PORT;
  return {
    port,
    origin: config.origin ?? defaultOrigin(port),
  };
}

export function isCompleteConfig(config: StoredConfig): config is RceConfig {
  return config.origin !== undefined && config.port !== undefined;
}

export function hasRuntimeOverride(command: Extract<CliCommand, { kind: "serve" }>): boolean {
  return command.origin !== undefined
    || command.port !== undefined
    || envValue("RCE_ORIGIN") !== undefined
    || envValue("PORT") !== undefined;
}

export function resolveServeConfig(
  command: Extract<CliCommand, { kind: "serve" }>,
  saved: StoredConfig,
): RceConfig {
  const portRaw = command.port ?? envValue("PORT");
  const port = portRaw === undefined ? (saved.port ?? DEFAULT_PORT) : parsePort(portRaw);
  const savedOriginIsDefault = saved.origin !== undefined
    && saved.port !== undefined
    && saved.origin === defaultOrigin(saved.port);
  const savedOrigin = portRaw !== undefined && savedOriginIsDefault ? undefined : saved.origin;
  const originRaw = command.origin ?? envValue("RCE_ORIGIN") ?? savedOrigin ?? defaultOrigin(port);
  return { port, origin: parseOrigin(originRaw) };
}

export function setStoredValue(config: StoredConfig, key: ConfigKey, raw: string): StoredConfig {
  if (key === "port") {
    const port = parsePort(raw);
    const previousPort = config.port ?? DEFAULT_PORT;
    const originTracksPort = config.origin === defaultOrigin(previousPort);
    return {
      ...config,
      port,
      ...(originTracksPort ? { origin: defaultOrigin(port) } : {}),
    };
  }
  return { ...config, origin: parseOrigin(raw) };
}

function parseConfigKey(raw: string | undefined): ConfigKey {
  if (raw === "origin" || raw === "port") return raw;
  throw new Error("Config key must be 'origin' or 'port'.");
}

export function parseCli(args = process.argv.slice(2)): CliCommand {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      origin: { type: "string", short: "o" },
      port: { type: "string", short: "p" },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return { kind: "help" };
  const [command, ...rest] = positionals;

  if (command === undefined) {
    return { kind: "serve", origin: values.origin, port: values.port, yes: values.yes };
  }

  if (command === "init") {
    if (rest.length > 0 || values.origin !== undefined || values.port !== undefined) {
      throw new Error("Usage: rce init [--yes]");
    }
    return { kind: "init", yes: values.yes };
  }

  if (command !== "config") throw new Error(`Unknown command: ${command}`);
  if (values.origin !== undefined || values.port !== undefined || values.yes) {
    throw new Error("Config commands do not accept --origin, --port, or --yes.");
  }

  const [action, ...configArgs] = rest;
  if (action === "get" && configArgs.length === 0) return { kind: "config-get" };
  if (action === "reset" && configArgs.length === 0) return { kind: "config-reset" };
  if (action === "unset" && configArgs.length === 1) {
    return { kind: "config-unset", key: parseConfigKey(configArgs[0]) };
  }
  if (action === "set" && configArgs.length === 2) {
    return { kind: "config-set", key: parseConfigKey(configArgs[0]), value: configArgs[1]! };
  }
  throw new Error("Usage: rce config get | set <origin|port> <value> | unset <origin|port> | reset");
}
