# RCE

RCE exposes Pi's `read` tool through an OAuth-protected MCP endpoint.
It uses the canonical directory from which you start `rce`.
RCE runs on Node.js. Bun is used for package management and workspace scripts.

```sh
bun install
bun link
```

From the directory you want to read:

```sh
rce
```

The temporary local-development endpoint is `http://127.0.0.1:6767/mcp`.
Each launch creates a fresh in-memory OAuth server and prints an approval code.
When an MCP client opens the authorization page, confirm that its code matches the terminal and approve it.
Stopping RCE invalidates every access token issued by that process.
Clients must support MCP `2026-07-28`, CIMD, and S256 PKCE and request the `mcp:tools` scope.
RCE supports `offline_access` refresh tokens for clients that request them.

Set `RCE_ORIGIN` to the origin that the client uses.
For remote access, use a public HTTPS origin and forward it to the loopback listener.
Set `PORT` to change the listener port. The public origin and port are separate settings.
RCE stores no authorization state on disk. Authorization codes, access tokens, and refresh tokens exist only for the lifetime of the process.

```sh
bun run dev:server
bun run check-types
bun run build
```

The built executable is `apps/server/dist/index.mjs`.
