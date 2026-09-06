# RCE

RCE exposes local coding tools through an OAuth-protected MCP endpoint. It always uses the canonical directory from which you start `rce` as the workspace root.

## Installation

RCE requires Node.js `>=22.19.0`.

Install the CLI globally:

```sh
npm install -g rce-mcp
rce
```

Or run it without installing:

```sh
npx rce-mcp
```

Run either command from the project directory you want RCE to access.

On the first interactive run, RCE asks for a local port and public origin, then saves them in the OS-native user config directory. Press Enter through both prompts to accept the defaults:

```text
port:   6767
origin: http://127.0.0.1:6767
```

After setup, `rce` starts normally without prompting. To configure non-interactively with the defaults:

```sh
rce --yes
```

For a one-off run, CLI flags override saved configuration without changing it:

```sh
rce --origin https://rce.example.com
rce --port 7000
```

Environment variables `RCE_ORIGIN` and `PORT` are also one-run overrides. Precedence is flags, environment, saved config, then defaults. RCE does not load project `.env` files.

Manage persistent settings with:

```sh
rce init
rce config get
rce config set origin https://rce.example.com
rce config set port 7000
rce config unset origin
rce config reset
```

The default local endpoint is:

```text
http://127.0.0.1:6767/mcp
```

```sh
rce --help
```

## OAuth

Each launch creates a fresh in-memory OAuth server and prints an approval code. When an MCP client opens the authorization page, confirm that its code matches the terminal and approve it.

Stopping RCE invalidates every access token issued by that process. RCE stores no authorization state on disk. Clients must support MCP `2026-07-28`, CIMD, S256 PKCE, and request the `mcp:tools` scope. `offline_access` refresh tokens are supported when requested.

The public origin and local port are intentionally separate: `--origin` tells OAuth/MCP which public origin the client uses, while `--port` controls only the loopback listener.

## Development

```sh
bun install
bun run check-types
bun run build
```

The publishable npm workspace is `apps/server`. Its executable is built to `apps/server/dist/index.mjs`.

Inspect the package before publishing:

```sh
cd apps/server
npm pack --dry-run
```
