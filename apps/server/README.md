# rce-mcp

RCE exposes one local project as an OAuth-protected MCP coding server for ChatGPT.

Start `rce` inside the project that ChatGPT should control. That directory stays fixed as the workspace root until RCE exits.

## Install

RCE requires Node.js `>=22.19.0`.

```sh
npm install -g rce-mcp
```

Or run it without a global install:

```sh
npx rce-mcp
```

For the best workflow, install [Herdr](https://herdr.dev/) and run RCE from a Herdr pane:

```sh
brew install herdr
cd ~/code/my-project
herdr
```

After tunnel setup, run RCE from a Herdr pane.

Herdr adds persistent interactive process tools. Without Herdr, the file, search, patch, and shell tools still work.

## Expose RCE to ChatGPT

ChatGPT needs a remote HTTPS MCP endpoint. RCE itself listens only on loopback.

The default local endpoint is:

```text
http://127.0.0.1:6767/mcp
```

### Cloudflare Tunnel, recommended for a permanent endpoint

Create a remotely managed [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/).

Add a **Published application** route with these values:

```text
Hostname:    rce.example.com
Service URL: http://localhost:6767
```

Then save the matching public origin in RCE:

```sh
rce config set port 6767
rce config set origin https://rce.example.com
```

Your ChatGPT MCP endpoint is:

```text
https://rce.example.com/mcp
```

A stable hostname lets the ChatGPT app keep the same endpoint between RCE sessions.

### Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel) is a quick alternative:

```sh
tailscale funnel --bg 6767
```

Save the public HTTPS origin that Tailscale prints:

```sh
rce config set origin https://my-machine.example.ts.net
```

## Configure RCE

Run setup from the project that ChatGPT should control:

```sh
cd ~/code/my-project
rce init
```

Use port `6767` and the public HTTPS origin from your tunnel.

Start RCE:

```sh
rce
```

Each launch prints an approval code. Keep the terminal visible while you connect ChatGPT.

Manage saved configuration with:

```sh
rce config get
rce config set origin https://rce.example.com
rce config set port 6767
rce config unset origin
rce config reset
```

Flags and `RCE_ORIGIN` or `PORT` can override saved values for one run.

## Connect ChatGPT

ChatGPT currently calls custom MCP integrations **apps**.

1. Enable **Developer mode** in ChatGPT.
2. Open **Settings → Apps → Create**.
3. Set the MCP endpoint to `https://rce.example.com/mcp`.
4. Select OAuth authentication.
5. Select **Scan Tools**.
6. Compare the browser approval code with the code printed by RCE.
7. Approve only when both codes match.
8. Finish the tool scan and create the app.

See the [OpenAI developer mode guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta) for current plan and workspace requirements.

Stopping RCE invalidates OAuth tokens from that process. ChatGPT can ask you to authorize again after RCE restarts.

## Tools

| Area | Tools |
| --- | --- |
| Read | `read`, `read_many`, `ls`, `find`, `grep` |
| Edit | `write`, `apply_patch` |
| Shell | `bash` |
| Persistent processes with Herdr | `process_start`, `process_read`, `process_wait`, `process_send`, `process_info`, `process_stop` |

RCE stores no authorization state on disk. It supports MCP `2026-07-28`, CIMD, S256 PKCE, and OAuth refresh tokens through `offline_access`.
