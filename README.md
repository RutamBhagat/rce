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

No project `.env` file is required. The default local endpoint is:

```text
http://127.0.0.1:6767/mcp
```

For remote access, start your HTTPS tunnel/reverse proxy separately and pass its public origin directly:

```sh
npx rce-mcp --origin https://rce.example.com
```

Change the local listener port with:

```sh
npx rce-mcp --port 7000
```

`RCE_ORIGIN` and `PORT` are still accepted as shell environment overrides for automation, but RCE does not load `.env` files.

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
