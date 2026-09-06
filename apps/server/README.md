# rce-mcp

Run an OAuth-protected MCP coding server against the directory you are currently in.

Requires Node.js `>=22.19.0`.

```sh
npm install -g rce-mcp
rce
```

Or without installing:

```sh
npx rce-mcp
```

The default endpoint is `http://127.0.0.1:6767/mcp`.

For a public HTTPS tunnel/reverse proxy:

```sh
npx rce-mcp --origin https://rce.example.com
```

To change the loopback port:

```sh
npx rce-mcp --port 7000
```

No `.env` file is loaded. `RCE_ORIGIN` and `PORT` remain supported as shell environment overrides.

```sh
rce --help
```
