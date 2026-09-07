import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { herdr } from "./herdr.ts";

type Workspace = { workspace_id: string; label: string };
type Pane = { pane_id: string; workspace_id: string; label?: string };
type LaunchFingerprint = { digest: string; length: number };
type WaitOutputResult = { matched_line?: string };
type ForegroundProcess = {
  argv?: string[];
  argv0?: string;
  cmdline?: string;
  cwd?: string;
  name?: string;
  pid: number;
};
type ProcessInfo = {
  pane_id: string;
  shell_pid: number;
  foreground_process_group_id: number;
  foreground_processes: ForegroundProcess[];
};
type ProcessInfoResult = { process_info: ProcessInfo; type?: string };

export type ProcessReadSource = "visible" | "recent" | "recent-unwrapped" | "detection";
export type ProcessWaitOptions = {
  lines?: number;
  match?: string;
  regex?: string;
  timeout?: number;
};
export type ProcessSendInput = { text: string } | { keys: string[] };

function fingerprint(text: string): LaunchFingerprint {
  return { digest: createHash("sha256").update(text).digest("hex"), length: text.length };
}

function isLaunchEcho(line: string, launch: LaunchFingerprint): boolean {
  if (line.length < launch.length) return false;
  return fingerprint(line.slice(-launch.length)).digest === launch.digest;
}

export class ProcessManager {
  readonly #root: string;
  readonly #label: string;
  readonly #controlLabel = "rce-control";
  readonly #launchFingerprints = new Map<string, LaunchFingerprint>();
  readonly #commands = new Map<string, string>();
  readonly #startedAt = new Map<string, number>();
  #pending: Promise<unknown> = Promise.resolve();

  static create(root: string, origin: string): ProcessManager | undefined {
    if (spawnSync("herdr", ["--version"]).status !== 0) return undefined;
    return new ProcessManager(root, origin);
  }

  private constructor(root: string, origin: string) {
    this.#root = root;
    this.#label = `rce-${createHash("sha256").update(JSON.stringify([root, origin])).digest("hex")}`;
  }

  async start(command: string): Promise<string> {
    return this.#queue(async () => {
      const workspace = await this.#findWorkspace();
      let control: Pane;
      if (workspace) {
        const panes = await this.#listPanes(workspace.workspace_id);
        const controls = panes.filter((pane) => pane.label === this.#controlLabel);
        if (controls.length !== 1) throw new Error("The RCE workspace must have exactly one control pane.");
        control = controls[0]!;
      } else {
        const created = await herdr<{ workspace: Workspace; root_pane: Pane }>([
          "workspace", "create", "--cwd", this.#root, "--label", this.#label, "--no-focus",
        ]);
        try {
          await herdr(["pane", "rename", created.root_pane.pane_id, this.#controlLabel]);
        } catch (error) {
          await herdr(["workspace", "close", created.workspace.workspace_id]);
          throw error;
        }
        control = created.root_pane;
      }

      const { pane } = await herdr<{ pane: Pane }>([
        "pane", "split", control.pane_id, "--direction", "down", "--cwd", this.#root, "--no-focus",
      ]);
      try {
        await herdr(["pane", "run", pane.pane_id, command]);
      } catch (error) {
        await herdr(["pane", "close", pane.pane_id]);
        throw error;
      }
      this.#launchFingerprints.set(pane.pane_id, fingerprint(command));
      this.#commands.set(pane.pane_id, command);
      this.#startedAt.set(pane.pane_id, performance.now());
      return pane.pane_id;
    });
  }

  async read(handle: string, options: { lines?: number; source?: ProcessReadSource } = {}): Promise<string> {
    return this.#queue(async () => {
      await this.#requireProcessPane(handle);
      return herdr<string>([
        "pane", "read", handle, "--source", options.source ?? "recent-unwrapped",
        ...(options.lines === undefined ? [] : ["--lines", String(options.lines)]),
      ]);
    });
  }

  async info(handle: string): Promise<ProcessInfoResult & { idle: boolean; command?: string; elapsedMs?: number }> {
    return this.#queue(async () => {
      await this.#requireProcessPane(handle);
      const result = await herdr<ProcessInfoResult>(["pane", "process-info", "--pane", handle]);
      const info = result.process_info;
      const idle = info.foreground_process_group_id === info.shell_pid
        && info.foreground_processes.every((process) => process.pid === info.shell_pid);
      const startedAt = this.#startedAt.get(handle);
      const command = this.#commands.get(handle);
      return {
        ...result,
        idle,
        ...(command === undefined ? {} : { command }),
        ...(startedAt === undefined ? {} : { elapsedMs: performance.now() - startedAt }),
      };
    });
  }

  async wait(handle: string, options: ProcessWaitOptions, signal?: AbortSignal): Promise<WaitOutputResult> {
    return this.#afterPending(async () => {
      await this.#requireProcessPane(handle);
      const result = await herdr<WaitOutputResult>([
        "pane", "wait-output", handle, "--source", "recent-unwrapped",
        ...(options.match === undefined ? ["--regex", options.regex!] : ["--match", options.match]),
        ...(options.timeout === undefined ? [] : ["--timeout", String(options.timeout)]),
        ...(options.lines === undefined ? [] : ["--lines", String(options.lines)]),
      ], signal);
      const launch = this.#launchFingerprints.get(handle);
      if (launch && result.matched_line && isLaunchEcho(result.matched_line, launch)) {
        throw new Error("The wait matched the echoed process_start command rather than process output. Use output text or a regex that does not match the launch command.");
      }
      return result;
    });
  }

  async send(handle: string, input: ProcessSendInput): Promise<void> {
    return this.#queue(async () => {
      await this.#requireProcessPane(handle);
      if ("text" in input) {
        await herdr(["pane", "send-text", handle, input.text]);
      } else {
        await herdr(["pane", "send-keys", handle, ...input.keys]);
      }
    });
  }

  async stop(handle: string): Promise<void> {
    return this.#queue(async () => {
      const { workspace } = await this.#requireProcessPane(handle);
      await herdr(["pane", "close", handle]);
      this.#launchFingerprints.delete(handle);
      this.#commands.delete(handle);
      this.#startedAt.delete(handle);
      const remaining = await this.#listPanes(workspace.workspace_id);
      if (remaining.every((pane) => pane.label === this.#controlLabel)) {
        await herdr(["workspace", "close", workspace.workspace_id]);
      }
    });
  }

  #queue<T>(operation: () => Promise<T>): Promise<T> {
    const request = this.#pending.then(operation);
    this.#pending = request.catch(() => {});
    return request;
  }

  #afterPending<T>(operation: () => Promise<T>): Promise<T> {
    return this.#pending.then(operation);
  }

  async #findWorkspace(): Promise<Workspace | undefined> {
    const { workspaces } = await herdr<{ workspaces: Workspace[] }>(["workspace", "list"]);
    const matches = workspaces.filter((workspace) => workspace.label === this.#label);
    if (matches.length > 1) throw new Error("Multiple RCE workspaces have the same label.");
    return matches[0];
  }

  async #listPanes(workspaceId: string): Promise<Pane[]> {
    const { panes } = await herdr<{ panes: Pane[] }>(["pane", "list", "--workspace", workspaceId]);
    return panes;
  }

  async #requireProcessPane(handle: string): Promise<{ workspace: Workspace; pane: Pane }> {
    const workspace = await this.#findWorkspace();
    if (!workspace) {
      this.#launchFingerprints.delete(handle);
      this.#commands.delete(handle);
      this.#startedAt.delete(handle);
      throw new Error("Unknown, closed, or foreign process handle.");
    }
    const panes = await this.#listPanes(workspace.workspace_id);
    const pane = panes.find((candidate) => candidate.pane_id === handle && candidate.workspace_id === workspace.workspace_id);
    if (!pane) {
      this.#launchFingerprints.delete(handle);
      this.#commands.delete(handle);
      this.#startedAt.delete(handle);
      throw new Error("Unknown, closed, or foreign process handle.");
    }
    if (pane.label === this.#controlLabel) throw new Error("The control pane is not a process handle.");
    return { workspace, pane };
  }
}
