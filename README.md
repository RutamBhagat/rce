# RCE

RCE exposes one local project as an OAuth-protected MCP coding server for ChatGPT.

Start `rce` inside the project that ChatGPT should control. That directory stays fixed as the workspace root until RCE exits.

RCE includes file reads, search, edits, Codex-compatible patches, shell commands, and optional persistent process control through [Herdr](https://herdr.dev/).

## Requirements

- Node.js `>=22.19.0`
- A public HTTPS origin that forwards to the local RCE port
- A ChatGPT plan and workspace that support the MCP actions you need
- [Herdr](https://herdr.dev/) for persistent process tools, recommended

> [!IMPORTANT]
> ChatGPT cannot connect directly to a local MCP server. Give RCE a stable public HTTPS origin before you create the ChatGPT app.

## Install

Install RCE globally:

```sh
npm install -g rce-mcp
```

Or run it without a global install:

```sh
npx rce-mcp
```

RCE binds only to loopback. The default local endpoint is:

```text
http://127.0.0.1:6767/mcp
```

## Recommended terminal setup

Install Herdr if you want persistent interactive process control:

```sh
brew install herdr
```

Other install methods are available in the [Herdr install guide](https://herdr.dev/docs/install/).

Start Herdr from the project directory:

```sh
cd ~/code/my-project
herdr
```

After tunnel setup, run RCE from a Herdr pane for the best workflow.

RCE detects the `herdr` CLI and adds persistent process tools when it is available. Without Herdr, the file, search, patch, and shell tools still work.

## Create a stable HTTPS endpoint

A stable hostname keeps the ChatGPT app configuration unchanged between RCE sessions.

### Cloudflare Tunnel, recommended for a permanent endpoint

Cloudflare recommends remotely managed tunnels for most use cases. They keep tunnel configuration in Cloudflare and support stable public hostnames.

1. Open the [Cloudflare Tunnels dashboard](https://one.dash.cloudflare.com/) and create a tunnel.
2. Name the tunnel, for example `rce`.
3. Select your operating system and run the generated `cloudflared` install command.
4. Wait until Cloudflare shows the connector as healthy.
5. Add a **Published application** route.
6. Set the public hostname, for example `rce.example.com`.
7. Set the service URL to `http://localhost:6767`.
8. Save the route.

See the [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/) for the current dashboard flow.

Use the public origin when you configure RCE:

```sh
rce config set port 6767
rce config set origin https://rce.example.com
```

The ChatGPT MCP endpoint is then:

```text
https://rce.example.com/mcp
```

> [!TIP]
> Run `cloudflared` as a system service if you want the tunnel to survive terminal restarts.

### Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel) is a quick alternative when you already use Tailscale.

Enable Funnel for your tailnet, then expose the RCE port:

```sh
tailscale funnel --bg 6767
```

Tailscale prints a public HTTPS URL similar to:

```text
https://my-machine.example.ts.net
```

Save that origin in RCE:

```sh
rce config set port 6767
rce config set origin https://my-machine.example.ts.net
```

Reset Funnel when you no longer want the public route:

```sh
tailscale funnel reset
```

Both tunnel options publish an HTTPS endpoint to the Internet. RCE still requires OAuth before MCP tools can run.

## Initial RCE setup

Run setup from the project that ChatGPT should control:

```sh
cd ~/code/my-project
rce init
```

RCE asks for two values:

```text
Local port:    6767
Public origin: https://rce.example.com
```

RCE stores these values in the OS-native user config directory. It does not load project `.env` files.

Start RCE after setup:

```sh
rce
```

Each launch prints an approval code. Keep that terminal visible while you connect ChatGPT.

For non-interactive local defaults:

```sh
rce --yes
```

Flags can override saved configuration for one run:

```sh
rce --origin https://rce.example.com
rce --port 7000
```

Environment variables `RCE_ORIGIN` and `PORT` also override saved values for one run.

Configuration precedence is:

```text
CLI flags > RCE_ORIGIN/PORT > saved config > defaults
```

Manage saved configuration with:

```sh
rce config get
rce config set origin https://rce.example.com
rce config set port 6767
rce config unset origin
rce config reset
```

## Create the ChatGPT custom app (plugin)

ChatGPT currently calls custom MCP integrations **apps**. OpenAI documents the setup under developer mode and custom MCP apps.

> [!NOTE]
> Full MCP write and modify actions currently require supported ChatGPT Business or Enterprise/Edu access. Check the [current OpenAI developer mode guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta) before setup.

1. Open ChatGPT on the web.
2. Enable **Developer mode** for your account or workspace.
3. Open **Settings → Apps → Create**. Workspace admins can also use **Workspace settings → Apps → Create**.
4. Enter a name such as `RCE`.
5. Set the MCP endpoint to `https://rce.example.com/mcp`.
6. Select OAuth authentication when ChatGPT asks for the authentication method.
7. Select **Scan Tools**.
8. Complete the OAuth flow in the browser.
9. Compare the browser approval code with the code printed by RCE.
10. Approve only when both codes match.
11. Wait for the tool scan to finish, then select **Create**.

Open a new chat and select RCE from the tools menu. You can also mention the app when a message needs repository access.

RCE creates fresh in-memory OAuth state on every launch. Stopping RCE invalidates tokens from that process, so ChatGPT can ask you to authorize again.

A stable tunnel hostname avoids recreating the ChatGPT app when RCE restarts.

## Tools

RCE exposes a small coding-focused tool set.

| Area | Tools |
| --- | --- |
| Read | `read`, `read_many`, `ls`, `find`, `grep` |
| Edit | `write`, `apply_patch` |
| Shell | `bash` |
| Persistent processes with Herdr | `process_start`, `process_read`, `process_wait`, `process_send`, `process_info`, `process_stop` |

`apply_patch` uses the Codex patch format and supports multi-file edits.

Persistent process tools use Herdr panes. RCE does not register them when the `herdr` CLI is unavailable.

## Workspace model

RCE resolves the current working directory once at startup and uses its canonical path as the workspace root.

Start one RCE process per project. Restart RCE from another directory when you want ChatGPT to control another project.

This fixed root keeps the tool surface tied to the project you chose at launch.

## OAuth lifecycle

Each RCE launch creates a fresh in-memory OAuth server and a new approval code.

Stopping RCE invalidates every access token and refresh token issued by that process. RCE stores no authorization state on disk.

The public origin and local port have separate jobs:

- `origin` is the public HTTPS origin used by OAuth and MCP clients.
- `port` is the local loopback port where RCE listens.

RCE supports MCP `2026-07-28`, CIMD, S256 PKCE, the `mcp:tools` scope, and `offline_access` refresh tokens.

## Development

Install dependencies and check the project:

```sh
bun install
bun run check-types
bun run --filter '*' test
bun run build
```

The publishable npm workspace is `apps/server`. Its executable builds to `apps/server/dist/index.mjs`.

Inspect the package before release:

```sh
cd apps/server
npm pack --dry-run
```
