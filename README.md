# RCE

RCE exposes the current project to ChatGPT through an OAuth-protected MCP server.

RCE exposes fast local coding tools backed by Pi, persistent process controls through Herdr, and MCP tools discovered from the local Codex CLI through `pi-mcp-adapter`.

For regular filesystem, search, shell, and process work, models should prefer the Pi-backed and Herdr tools. MCP-backed plugin tools are projected into the same native tool surface, so there is no Codex app-server RPC hop during tool calls.

RCE also provides direct batched reads and Codex-format patching shortcuts.

> [!IMPORTANT]
> RCE does not start Codex model inference or a Codex app-server. Codex is used only to resolve the effective MCP inventory at startup.

## What RCE exposes

Pi and Herdr are the primary path for ordinary coding work. MCP-backed plugins are exposed as native Pi extension tools.

| Area | RCE tools | Purpose |
| --- | --- | --- |
| Pi coding tools | `ls`, `find`, `grep`, `write`, `bash` | Fast direct filesystem, search, write, and shell operations. |
| Pi skills | `list_skills`, `load_skill` | Discover and load local Agent Skills without routing through Codex. |
| Direct files | `read_many`, `apply_patch` | Read files in batches and apply structured Codex-format patches. |
| Persistent processes | `process_start`, `process_read`, `process_wait`, `process_send`, `process_info`, `process_stop` | Run and control persistent or interactive commands through Herdr. |
| MCP plugins | dynamically discovered direct tools | MCP servers from the effective Codex CLI configuration, connected through `pi-mcp-adapter`. |

At startup, RCE runs `codex mcp list --json` once and converts the effective transports into an in-memory `pi-mcp-adapter` configuration. The inventory output is never logged because it can contain resolved environment values or HTTP headers.

`pi-mcp-adapter` connects enabled servers to discover tool metadata and caches it. MCP tools are then registered directly, so calls do not pass through a generic JSON-RPC gateway or require the model to translate method names and schemas.

When a downstream MCP tool needs user input or approval, RCE forwards that request through MCP's multi-round-trip `input_required` flow. The original downstream call stays suspended and resumes with the client's `inputResponses`, so approval does not replay the tool operation.

Connector-only Codex app bindings and Codex-specific thread/runtime APIs are intentionally outside this surface. RCE only projects MCP-backed capabilities here.

## Requirements

- Node.js `>=24.0.0`
- A public HTTPS origin that forwards to the local RCE port
- A ChatGPT plan and workspace that support the MCP actions you need
- [Herdr](https://herdr.dev/) for persistent process tools, recommended

> [!IMPORTANT]
> ChatGPT cannot connect directly to a local MCP server. Give RCE a stable public HTTPS origin before you create the ChatGPT app.

## Install

Install RCE globally with npm:

```sh
npm install -g rce-mcp
cd ~/code/my-project
rce
```

Or run it with `npx`:

```sh
cd ~/code/my-project
npx rce-mcp
```

RCE fixes the current directory as the workspace root for that process.

The default local MCP endpoint is:

```text
http://127.0.0.1:6767/mcp
```

RCE binds only to loopback.

## Add Herdr process control

Install Herdr if you want persistent interactive process control:

```sh
brew install herdr
```

Other install methods are in the [Herdr install guide](https://herdr.dev/docs/install/).

RCE detects the `herdr` CLI at startup. When Herdr is available, RCE registers the `process_*` tools.

These tools use dedicated Herdr panes for long-running or interactive commands. They can read terminal output, send input, and wait for output. They can also inspect foreground process state and close the process pane.

Without Herdr, the Pi-backed tools, MCP plugin tools, `read_many`, and `apply_patch` still work.

## Create a stable HTTPS endpoint

A stable hostname keeps the ChatGPT app configuration unchanged between RCE sessions.

### Cloudflare Tunnel

Cloudflare recommends remotely managed tunnels for most use cases. They support stable public hostnames and keep tunnel configuration in Cloudflare.

1. Open the [Cloudflare Tunnels dashboard](https://one.dash.cloudflare.com/) and create a tunnel.
2. Name the tunnel, for example `rce`.
3. Select your operating system and run the generated `cloudflared` install command.
4. Wait until Cloudflare shows the connector as healthy.

5. Add a **Published application** route.
6. Set a public hostname, for example `rce.example.com`.
7. Set the service URL to `http://localhost:6767`.
8. Save the route.

See the [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/) for the current dashboard flow.

Save the public origin in RCE:

```sh
rce config set port 6767
rce config set origin https://rce.example.com
```

The public MCP endpoint is then:

```text
https://rce.example.com/mcp
```

> [!TIP]
> Run `cloudflared` as a system service if you want the tunnel to survive terminal restarts.

### Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel) is a quick alternative when you already use Tailscale.

Expose the RCE port:

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

## Configure RCE

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

Use local defaults without interactive setup:

```sh
rce --yes
```

Override saved configuration for one run:

```sh
rce --origin https://rce.example.com
rce --port 7000
```

`RCE_ORIGIN` and `PORT` also override saved values for one run.

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

## Connect ChatGPT

ChatGPT calls custom MCP integrations **apps**.

> [!NOTE]
> MCP write and modify actions depend on current ChatGPT plan and workspace support. Check the [OpenAI developer mode guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta) before setup.

1. Open ChatGPT on the web.
2. Enable **Developer mode** for your account or workspace.
3. Open **Settings → Apps → Create**.
4. Enter a name such as `RCE`.
5. Set the MCP endpoint to `https://rce.example.com/mcp`.
6. Select OAuth authentication.

7. Select **Scan Tools**.
8. Complete the OAuth flow in the browser.
9. Compare the browser approval code with the code printed by RCE.
10. Approve only when both codes match.
11. Wait for the tool scan to finish, then select **Create**.

Open a new chat and select RCE from the tools menu. You can also mention RCE when a message needs project access.

If your ChatGPT client exposes plugin permissions, you can allow RCE actions there. Grant only the access level you want RCE to have.

## Workspace and authorization model

RCE resolves the current working directory at startup and uses its canonical path as the initial workspace root. The model can change the active workspace at runtime with the `set_root` tool; relative paths passed to that tool resolve from the current root.

Each RCE launch also creates fresh in-memory OAuth state and a new approval code. RCE stores no authorization state on disk.

Stopping RCE invalidates the access and refresh tokens issued by that process. ChatGPT can ask you to authorize again after a restart.

A stable public hostname keeps the ChatGPT app endpoint unchanged while each RCE process gets a new authorization session.

The two configuration values have separate roles:

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
