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

The first interactive run asks for the local port and public origin and saves them in the OS-native user config directory. Press Enter through setup to accept port `6767` and origin `http://127.0.0.1:6767`.

After that, `rce` starts without prompting. Use `rce --yes` to save the defaults non-interactively.

Flags and environment variables override saved configuration for one run without changing it:

```sh
rce --origin https://rce.example.com
rce --port 7000
```

Persist settings explicitly with:

```sh
rce init
rce config get
rce config set origin https://rce.example.com
rce config set port 7000
rce config unset origin
rce config reset
```

Precedence is CLI flags, `RCE_ORIGIN`/`PORT`, saved config, then defaults. No project `.env` file is loaded.

```sh
rce --help
```
