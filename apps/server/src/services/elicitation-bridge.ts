import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";

const PENDING_CALL_TIMEOUT_MS = 10 * 60 * 1_000;

type ToolResult = Awaited<ReturnType<PendingCall["run"]>>;
type CallEvent =
  | { kind: "input"; prompt: PendingPrompt }
  | { kind: "done"; result: ToolResult }
  | { kind: "error"; error: unknown };

type PendingPrompt = {
  id: string;
  request: ReturnType<typeof inputRequired.elicit>;
  resolve(view: ReturnType<typeof inputResponse>): void;
};

type PendingCallOptions = {
  handle: string;
  serverName: string;
  toolName: string;
  args: unknown;
  release: () => void;
  onFinish: () => void;
  run: (signal: AbortSignal) => Promise<unknown>;
};

class PendingCall {
  readonly handle: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly args: unknown;
  readonly abortController = new AbortController();
  readonly run: (signal: AbortSignal) => Promise<unknown>;
  currentPrompt?: PendingPrompt;

  readonly #release: () => void;
  readonly #onFinish: () => void;
  readonly #events: CallEvent[] = [];
  readonly #waiters: Array<(event: CallEvent) => void> = [];
  readonly #timeout: NodeJS.Timeout;
  #finished = false;

  constructor(options: PendingCallOptions) {
    this.handle = options.handle;
    this.serverName = options.serverName;
    this.toolName = options.toolName;
    this.args = options.args;
    this.run = options.run;
    this.#release = options.release;
    this.#onFinish = options.onFinish;
    this.#timeout = setTimeout(() => {
      this.abortController.abort(new Error("MCP elicitation timed out"));
      this.currentPrompt?.resolve({ kind: "elicit", action: "cancel" });
      this.emit({ kind: "error", error: new Error("MCP elicitation timed out") });
    }, PENDING_CALL_TIMEOUT_MS);
    this.#timeout.unref?.();
  }

  emit(event: CallEvent): void {
    if (this.#finished) return;
    if (event.kind === "done" || event.kind === "error") this.finish();
    const waiter = this.#waiters.shift();
    if (waiter) waiter(event);
    else this.#events.push(event);
  }

  nextEvent(): Promise<CallEvent> {
    const event = this.#events.shift();
    if (event) return Promise.resolve(event);
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    clearTimeout(this.#timeout);
    this.#release();
    this.#onFinish();
  }
}

export class McpElicitationBridge {
  readonly #activeByServer = new Map<string, PendingCall>();
  readonly #pendingByHandle = new Map<string, PendingCall>();
  readonly #formOwner = new AsyncLocalStorage<PendingCall>();
  readonly #lockTails = new Map<string, Promise<void>>();

  readonly ui = {
    select: async (title: string, options: string[]) => {
      const call = this.#resolveCall(title);
      const allowed = new Set(options);
      return this.#request<string | undefined>(call, {
        message: title,
        requestedSchema: {
          type: "object",
          properties: {
            choice: { type: "string", enum: options },
          },
          required: ["choice"],
        },
      }, (view) => {
        if (view.kind !== "elicit" || view.action !== "accept") return undefined;
        const choice = view.content?.choice;
        return typeof choice === "string" && allowed.has(choice) ? choice : undefined;
      });
    },
    confirm: async (title: string, message: string) => {
      const call = this.#resolveCall(`${title}\n\n${message}`);
      return this.#request<boolean>(call, {
        message: `${title}\n\n${message}`,
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean" } },
          required: ["confirm"],
        },
      }, (view) => view.kind === "elicit" && view.action === "accept" && view.content?.confirm === true);
    },
    input: async (title: string, placeholder?: string) => {
      const call = this.#resolveCall(title);
      return this.#request<string | undefined>(call, {
        message: title,
        requestedSchema: {
          type: "object",
          properties: {
            value: {
              type: "string",
              ...(placeholder ? { description: placeholder } : {}),
            },
          },
          required: ["value"],
        },
      }, (view) => {
        if (view.kind !== "elicit" || view.action !== "accept") return undefined;
        return typeof view.content?.value === "string" ? view.content.value : undefined;
      });
    },
    notify: () => {},
    setStatus: () => {},
  } as unknown as ExtensionUIContext;

  async execute(
    serverName: string,
    toolName: string,
    args: unknown,
    ctx: ServerContext,
    run: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<unknown | InputRequiredResult> {
    const requestState = ctx.mcpReq.requestState<string>();
    if (requestState !== undefined) {
      const pending = this.#pendingByHandle.get(requestState);
      if (!pending) throw new Error("The pending MCP interaction expired; retry the tool call.");
      if (pending.toolName !== toolName || !isDeepStrictEqual(pending.args, args)) {
        throw new Error("The pending MCP interaction does not match this tool call.");
      }
      if (!this.#resumePrompt(pending, ctx)) return this.#inputRequired(pending);
      return this.#advance(pending);
    }

    const release = await this.#acquire(serverName);
    let pending!: PendingCall;
    pending = new PendingCall({
      handle: crypto.randomUUID(),
      serverName,
      toolName,
      args: structuredClone(args),
      release,
      onFinish: () => {
        this.#pendingByHandle.delete(pending.handle);
        if (this.#activeByServer.get(serverName) === pending) this.#activeByServer.delete(serverName);
      },
      run,
    });
    this.#pendingByHandle.set(pending.handle, pending);
    this.#activeByServer.set(serverName, pending);

    void pending.run(pending.abortController.signal).then(
      (result) => pending.emit({ kind: "done", result }),
      (error) => pending.emit({ kind: "error", error }),
    );

    return this.#advance(pending);
  }

  async #advance(pending: PendingCall): Promise<unknown | InputRequiredResult> {
    const event = await pending.nextEvent();
    if (event.kind === "done") {
      return event.result;
    }
    if (event.kind === "error") {
      throw event.error;
    }

    pending.currentPrompt = event.prompt;
    return this.#inputRequired(pending);
  }

  #resumePrompt(pending: PendingCall, ctx: ServerContext): boolean {
    const prompt = pending.currentPrompt;
    if (!prompt) return true;
    const view = inputResponse(ctx.mcpReq.inputResponses, prompt.id);
    if (view.kind === "missing") return false;
    pending.currentPrompt = undefined;
    prompt.resolve(view);
    return true;
  }

  #inputRequired(pending: PendingCall): InputRequiredResult {
    const prompt = pending.currentPrompt;
    if (!prompt) throw new Error("The pending MCP interaction has no input request.");
    return inputRequired({
      inputRequests: { [prompt.id]: prompt.request },
      requestState: pending.handle,
    });
  }

  #resolveCall(title: string): PendingCall {
    const current = this.#formOwner.getStore();
    if (current) return current;

    const serverName = /^MCP Input Request\nServer: ([^\n]+)\n/m.exec(title)?.[1];
    const call = serverName ? this.#activeByServer.get(serverName) : undefined;
    if (!call) throw new Error("RCE could not associate the MCP elicitation with an active tool call.");
    this.#formOwner.enterWith(call);
    return call;
  }

  #request<T>(
    call: PendingCall,
    params: Parameters<typeof inputRequired.elicit>[0],
    decode: (view: ReturnType<typeof inputResponse>) => T,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      const prompt: PendingPrompt = {
        id: crypto.randomUUID(),
        request: inputRequired.elicit(params),
        resolve: (view) => resolve(decode(view)),
      };
      call.emit({ kind: "input", prompt });
    });
  }

  async #acquire(serverName: string): Promise<() => void> {
    const previous = this.#lockTails.get(serverName) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.#lockTails.set(serverName, tail);
    await previous;
    return () => {
      release();
      if (this.#lockTails.get(serverName) === tail) this.#lockTails.delete(serverName);
    };
  }
}
