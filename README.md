# RCE

RCE exposes the current project to ChatGPT through an OAuth-protected MCP server.

Think of RCE as a remote bridge to the local Codex CLI runtime, with extra Herdr process controls.

RCE starts one `codex app-server` in the project directory. ChatGPT can inspect the exact app-server protocol and call its non-inference runtime methods. This gives access to Codex filesystem, command, skill, plugin, MCP, and other runtime surfaces supported by the installed Codex version.

RCE also adds direct batched reads, Codex-format patching, and persistent interactive processes through [Herdr](https://herdr.dev/).

> [!IMPORTANT]
> RCE does not start Codex model inference. It exposes the Codex runtime and control plane, not another coding agent.

## What RCE exposes

The Codex app-server is the primary control plane.

| Area | RCE tools | Purpose |
| --- | --- | --- |
| Codex app-server | `codex_protocol`, `codex_rpc`, `codex_events`, `codex_respond` | Inspect and use the allowed Codex runtime control plane. |
| Direct files | `read_many`, `apply_patch` | Read files in batches and apply structured Codex-format patches. |
| Persistent processes | `process_start`, `process_read`, `process_wait`, `process_send`, `process_info`, `process_stop` | Run and control persistent or interactive commands through Herdr. |

At startup, RCE asks the installed Codex binary to generate its experimental app-server JSON schemas. The `codex_protocol` tool reads those schemas. The available RPC surface therefore follows the local Codex version instead of a hard-coded method list.

Typical `codex_rpc` capabilities include:

- standalone command execution with `command/exec`
- skill discovery with `skills/list`
- plugin discovery and inspection with `plugin/*`
- MCP inventory and direct MCP calls with `mcpServer*`
- thread and runtime metadata that do not start model execution
- other non-inference client requests exposed by the installed app-server

For source search, call `command/exec` with `rg` or `rg --files`. Codex also exposes `fuzzyFileSearch` for fuzzy filename search when the installed version supports it.

`read_many` and `apply_patch` remain useful shortcuts for common coding work. They avoid extra app-server RPC discovery for batched reads and structured edits.

### Methods RCE blocks

RCE owns the app-server connection handshake, so it does not forward `initialize` or `initialized`.

RCE also blocks Codex model-execution methods:

- `turn/*`
- `review/start`
- `thread/compact/start`
- `thread/queue/start`
- `thread/realtime/*`

This boundary keeps ChatGPT as the active model while Codex supplies local runtime capabilities.

### Plugins, skills, browser, and Computer Use

Because RCE exposes the Codex app-server, ChatGPT can discover the skills and plugins available to that Codex installation.

Use `skills/list` and `plugin/installed` to inspect them. Use `mcpServerStatus/list` to inspect MCP-backed plugin tools after you create a runtime thread when required.

Not every plugin action is callable outside a Codex model turn. Connector-only app actions can be unavailable through this bridge.

Computer Use requires Codex turn metadata, but it does not require a Codex model turn for direct MCP calls. RCE can create an ephemeral runtime thread and supply synthetic `x-codex-turn-metadata` when it calls `cua_repl` through `mcpServer/tool/call`. This keeps Computer Use on the runtime path and avoids Codex model inference.

Native app access can require a Computer Use approval. Start the ephemeral thread with `approvalPolicy: "on-request"` before selecting an app.

Do not use `approvalPolicy: "never"` for Computer Use. That policy rejects required app approvals before RCE can surface them.

When `codex_rpc` returns a pending `mcpServer/elicitation/request`, answer it with `codex_respond`. Then resume the returned RPC handle.

For session-scoped approval, accept the elicitation with response metadata `{ "persist": "session" }`. Use durable approval only when the user requests it.

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

Without Herdr, the Codex app-server tools, `read_many`, and `apply_patch` still work.

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

RCE resolves the current working directory once at startup and uses its canonical path as the workspace root.

Start one RCE process per project. Restart RCE from another directory when you want to expose another project.

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
