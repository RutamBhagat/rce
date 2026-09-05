import type { McpServer } from "@modelcontextprotocol/server";
import { env } from "@rce/env/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { herdr } from "./herdr.ts";
import { ROOT } from "./root.ts";

type Workspace = { workspace_id: string; label: string };
type Pane = { pane_id: string; workspace_id: string; label?: string };
const label = `rce-${createHash("sha256").update(JSON.stringify([ROOT, env.RCE_ORIGIN])).digest("hex")}`;
const controlLabel = "rce-control";
let pending: Promise<unknown> = Promise.resolve();

export function registerProcessTools(server: McpServer) {
  server.registerTool("process_start", {
    description: "Start a persistent shell command in the invocation directory. Return its Herdr pane ID as the process handle.",
    inputSchema: z.object({ command: z.string().refine((value) => value.trim().length > 0, "Command must not be empty.") }),
  }, async ({ command }) => {
    // Serialize operations so workspace creation and cleanup cannot overlap.
    const start = pending.then(async () => {
      const { workspaces } = await herdr<{ workspaces: Workspace[] }>(["workspace", "list"]);
      const matches = workspaces.filter((workspace) => workspace.label === label);
      if (matches.length > 1) throw new Error("Multiple RCE workspaces have the same label.");
      let control: Pane | undefined;
      if (matches[0]) {
        const { panes } = await herdr<{ panes: Pane[] }>(["pane", "list", "--workspace", matches[0].workspace_id]);
        const controls = panes.filter((pane) => pane.label === controlLabel);
        if (controls.length !== 1) throw new Error("The RCE workspace must have exactly one control pane.");
        control = controls[0];
      } else {
        const created = await herdr<{ workspace: Workspace; root_pane: Pane }>([
          "workspace", "create", "--cwd", ROOT, "--label", label, "--no-focus",
        ]);
        try {
          await herdr(["pane", "rename", created.root_pane.pane_id, controlLabel]);
        } catch (error) {
          await herdr(["workspace", "close", created.workspace.workspace_id]);
          throw error;
        }
        control = created.root_pane;
      }
      const { pane } = await herdr<{ pane: Pane }>([
        "pane", "split", control!.pane_id, "--direction", "down", "--cwd", ROOT, "--no-focus",
      ]);
      try {
        await herdr(["pane", "run", pane.pane_id, command]);
      } catch (error) {
        await herdr(["pane", "close", pane.pane_id]);
        throw error;
      }
      return { content: [{ type: "text" as const, text: pane.pane_id }] };
    });
    pending = start.catch(() => {});
    try {
      return await start;
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
    }
  });

  for (const operation of ["read", "stop", "wait", "send"] as const) {
    const inputSchema = z.object({
      handle: z.string().min(1),
      lines: z.number().int().positive().optional(),
      match: z.string().min(1).optional(),
      regex: z.string().min(1).optional(),
      timeout: z.number().int().nonnegative().optional(),
      text: z.string().optional(),
      keys: z.array(z.string().min(1)).min(1).optional(),
    }).pick({
      handle: true,
      ...((operation === "read" || operation === "wait") ? { lines: true as const } : {}),
      ...(operation === "wait" ? { match: true as const, regex: true as const, timeout: true as const } : {}),
      ...(operation === "send" ? { text: true as const, keys: true as const } : {}),
    }).refine((args) => operation !== "wait" || (args.match !== undefined) !== (args.regex !== undefined),
      "Specify exactly one of match or regex.")
      .refine((args) => operation !== "send" || (args.text !== undefined) !== (args.keys !== undefined),
        "Specify exactly one of text or keys.");
    server.registerTool(`process_${operation}`, {
      description: operation === "read"
        ? "Read recent process output without terminal wrapping. Defaults to the last 80 terminal rows."
        : operation === "stop"
          ? "Stop a process by closing its pane. Close its RCE workspace when no child panes remain."
          : operation === "wait"
            ? "Wait for a literal substring or Rust regex in recent unwrapped output. Timeout is in milliseconds. Omit timeout to wait indefinitely. Specify exactly one of match or regex."
            : "Send literal text without Enter, or an ordered array of terminal keys/chords such as Enter and ctrl+c. Specify exactly one of text or keys.",
      inputSchema,
    }, async ({ handle, lines, match, regex, timeout, text, keys }, ctx) => {
      const request = pending.then(async () => {
        const { workspaces } = await herdr<{ workspaces: Workspace[] }>(["workspace", "list"]);
        const matches = workspaces.filter((workspace) => workspace.label === label);
        if (matches.length > 1) throw new Error("Multiple RCE workspaces have the same label.");
        const workspace = matches[0];
        if (!workspace) throw new Error("Unknown, closed, or foreign process handle.");
        const { panes } = await herdr<{ panes: Pane[] }>(["pane", "list", "--workspace", workspace.workspace_id]);
        const pane = panes.find((pane) => pane.pane_id === handle && pane.workspace_id === workspace.workspace_id);
        if (!pane) throw new Error("Unknown, closed, or foreign process handle.");
        if (pane.label === controlLabel) throw new Error("The control pane is not a process handle.");
        if (operation === "wait") {
          const result = await herdr([
            "pane", "wait-output", handle, "--source", "recent-unwrapped",
            ...(match === undefined ? ["--regex", regex!] : ["--match", match]),
            ...(timeout === undefined ? [] : ["--timeout", String(timeout)]),
            ...(lines === undefined ? [] : ["--lines", String(lines)]),
          ], ctx.mcpReq.signal);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
        if (operation === "send") {
          await herdr(text === undefined
            ? ["pane", "send-keys", handle, ...keys!]
            : ["pane", "send-text", handle, text]);
          return { content: [{ type: "text" as const, text: `Sent input to process ${handle}.` }] };
        }
        if (operation === "read") {
          const output = await herdr<string>(["pane", "read", handle, "--source", "recent-unwrapped",
            ...(lines === undefined ? [] : ["--lines", String(lines)])]);
          return { content: [{ type: "text" as const, text: output }] };
        }
        await herdr(["pane", "close", handle]);
        const remaining = await herdr<{ panes: Pane[] }>(["pane", "list", "--workspace", workspace.workspace_id]);
        if (remaining.panes.every((pane) => pane.label === controlLabel)) {
          await herdr(["workspace", "close", workspace.workspace_id]);
        }
        return { content: [{ type: "text" as const, text: `Stopped process ${handle}.` }] };
      });
      // A wait must not block input, reads, or stops.
      if (operation !== "wait") pending = request.catch(() => {});
      try {
        return await request;
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
}
