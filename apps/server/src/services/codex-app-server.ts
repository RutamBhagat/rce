import {
  RpcSession,
  StdioTransport,
  type JsonValue,
  type RpcErrorObject,
  type RpcId,
  type RpcInboundRequest,
} from "codex-app-server-client";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

const require = createRequire(import.meta.url);
const codexEntrypoint = require.resolve("@openai/codex/bin/codex.js");
const DEFAULT_WAIT_MS = 30_000;
const MAX_WAIT_MS = 120_000;
const MAX_BUFFERED_NOTIFICATIONS = 1_000;

type AppServerProcess = ChildProcessByStdio<Writable, Readable, Readable>;
type ProtocolKind = "client_request" | "server_request" | "notification";
type ProtocolUnion = {
  definitions?: Record<string, JsonSchema>;
  oneOf?: ProtocolVariant[];
};
type JsonSchema = Record<string, unknown>;
type ProtocolVariant = JsonSchema & {
  description?: string;
  properties?: {
    method?: { enum?: string[] };
    params?: { $ref?: string };
  };
};
type ProtocolEntry = {
  method: string;
  description?: string;
  paramsDefinition?: string;
  variant: ProtocolVariant;
};
type CallState = {
  handle: string;
  method: string;
  status: "pending" | "completed" | "error";
  result?: JsonValue;
  error?: { name: string; message: string; code?: number; data?: JsonValue };
  settled: Promise<void>;
};
type BufferedNotification = { method: string; params?: JsonValue };

type RpcStartInput = {
  method: string;
  params?: JsonValue;
  waitMs?: number;
};
type RpcResumeInput = {
  handle: string;
  waitMs?: number;
};

export class CodexAppServerService {
  readonly #session: RpcSession;
  readonly #schemaDir: string;
  readonly #protocols: Record<ProtocolKind, { union: ProtocolUnion; entries: ProtocolEntry[] }>;
  readonly #pendingServerRequests = new Map<RpcId, RpcInboundRequest>();
  readonly #calls = new Map<string, CallState>();
  readonly #notifications: BufferedNotification[] = [];
  readonly #serverRequestWaiters = new Set<() => void>();
  #droppedNotifications = 0;

  static async create(root: string): Promise<CodexAppServerService> {
    const schemaDir = await mkdtemp(path.join(tmpdir(), "rce-codex-schema-"));
    let child: AppServerProcess | undefined;
    try {
      await generateProtocolSchemas(root, schemaDir);
      const protocols = {
        client_request: await loadProtocolUnion(schemaDir, "ClientRequest.json"),
        server_request: await loadProtocolUnion(schemaDir, "ServerRequest.json"),
        notification: await loadProtocolUnion(schemaDir, "ServerNotification.json"),
      } satisfies Record<ProtocolKind, { union: ProtocolUnion; entries: ProtocolEntry[] }>;

      child = spawn(process.execPath, [
        codexEntrypoint,
        "app-server",
        "--listen",
        "stdio://",
      ], {
        cwd: root,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      await once(child, "spawn");
      child.stderr.pipe(process.stderr, { end: false });

      const session = new RpcSession({
        transport: new StdioTransport({ input: child.stdout, output: child.stdin }),
      });
      const service = new CodexAppServerService(child, session, schemaDir, protocols);
      await service.#initialize();
      return service;
    } catch (error) {
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      rmSync(schemaDir, { recursive: true, force: true });
      throw error;
    }
  }

  private constructor(
    child: AppServerProcess,
    session: RpcSession,
    schemaDir: string,
    protocols: Record<ProtocolKind, { union: ProtocolUnion; entries: ProtocolEntry[] }>,
  ) {
    this.#session = session;
    this.#schemaDir = schemaDir;
    this.#protocols = protocols;

    session.onNotification((notification) => {
      this.#notifications.push(notification);
      if (this.#notifications.length > MAX_BUFFERED_NOTIFICATIONS) {
        this.#notifications.shift();
        this.#droppedNotifications += 1;
      }
    });
    session.onRequest((request) => {
      this.#pendingServerRequests.set(request.id, request);
      for (const resolve of this.#serverRequestWaiters) resolve();
      this.#serverRequestWaiters.clear();
    });
    session.onError((error) => {
      this.#notifications.push({
        method: "rce/codexAppServer/error",
        params: { message: error.message },
      });
    });
    session.onClose((error) => {
      this.#notifications.push({
        method: "rce/codexAppServer/closed",
        params: error ? { message: error.message } : {},
      });
    });

    process.once("exit", () => {
      rmSync(schemaDir, { recursive: true, force: true });
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    });
  }

  async #initialize(): Promise<void> {
    await this.#session.start();
    await this.#session.request("initialize", {
      clientInfo: { name: "rce", title: "RCE", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    await this.#session.initialized();
  }

  async protocol(input: {
    kind?: ProtocolKind;
    method?: string;
    query?: string;
    limit?: number;
  }): Promise<unknown> {
    const kind = input.kind ?? "client_request";
    const protocol = this.#protocols[kind];

    if (input.method) {
      const entry = protocol.entries.find((candidate) => candidate.method === input.method);
      if (!entry) throw new Error(`Unknown Codex app-server ${kind} method: ${input.method}`);
      const paramsSchema = entry.paramsDefinition
        ? schemaWithDefinitionClosure(protocol.union, entry.paramsDefinition)
        : undefined;
      const responseSchema = entry.paramsDefinition
        ? await this.#readResponseSchema(entry.paramsDefinition)
        : undefined;
      return {
        kind,
        method: entry.method,
        description: entry.description ?? null,
        paramsSchema: paramsSchema ?? null,
        responseSchema: responseSchema ?? null,
      };
    }

    const query = input.query?.trim().toLowerCase() ?? "";
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const matches = protocol.entries.filter((entry) => {
      if (!query) return true;
      return entry.method.toLowerCase().includes(query)
        || (entry.description?.toLowerCase().includes(query) ?? false);
    });
    return {
      kind,
      total: protocol.entries.length,
      matched: matches.length,
      methods: matches.slice(0, limit).map((entry) => ({
        method: entry.method,
        ...(entry.description ? { description: entry.description } : {}),
      })),
      truncated: matches.length > limit,
    };
  }

  async rpc(input: RpcStartInput | RpcResumeInput): Promise<unknown> {
    if ("handle" in input) {
      const call = this.#calls.get(input.handle);
      if (!call) throw new Error(`Unknown or already-consumed Codex RPC handle: ${input.handle}`);
      return this.#waitForCall(call, normalizeWaitMs(input.waitMs));
    }

    if (input.method === "initialize" || input.method === "initialized") {
      throw new Error(input.method === "initialize"
        ? "Codex app-server allows initialize exactly once per transport connection; RCE already sent it during startup."
        : "The initialized acknowledgement is owned by RCE's app-server connection lifecycle and cannot be forwarded.");
    }
    if (isModelExecutionMethod(input.method)) {
      throw new Error(`${input.method} is disabled in RCE; Codex model inference is never started through this bridge.`);
    }

    const handle = randomUUID();
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const call: CallState = {
      handle,
      method: input.method,
      status: "pending",
      settled,
    };
    this.#calls.set(handle, call);

    void this.#session.request(input.method, input.params).then(
      (result) => {
        call.status = "completed";
        call.result = result;
        settle();
      },
      (error) => {
        call.status = "error";
        call.error = serializeError(error);
        settle();
      },
    );

    return this.#waitForCall(call, normalizeWaitMs(input.waitMs));
  }

  events(limit = 100): unknown {
    const normalizedLimit = Math.min(Math.max(limit, 1), 500);
    const notifications = this.#notifications.splice(0, normalizedLimit);
    const remainingNotifications = this.#notifications.length;
    const droppedNotifications = this.#droppedNotifications;
    this.#droppedNotifications = 0;
    return {
      notifications,
      remainingNotifications,
      droppedNotifications,
      pendingServerRequests: this.#listPendingServerRequests(),
      pendingRpcCalls: [...this.#calls.values()]
        .filter((call) => call.status === "pending")
        .map((call) => ({ handle: call.handle, method: call.method })),
    };
  }

  async respond(input: {
    id: RpcId;
    result?: JsonValue;
    error?: RpcErrorObject;
  }): Promise<unknown> {
    const request = this.#pendingServerRequests.get(input.id);
    if (!request) throw new Error(`Unknown or already-answered Codex server request id: ${String(input.id)}`);

    if (input.error) await request.respondError(input.error);
    else await request.respond(input.result);
    this.#pendingServerRequests.delete(input.id);
    return { responded: true, id: input.id, method: request.method };
  }

  async #waitForCall(call: CallState, waitMs: number): Promise<unknown> {
    if (call.status === "pending" && this.#pendingServerRequests.size === 0 && waitMs > 0) {
      await Promise.race([call.settled, this.#waitForServerRequest(waitMs)]);
    }

    if (call.status === "completed") {
      this.#calls.delete(call.handle);
      return { status: "completed", method: call.method, result: call.result ?? null };
    }
    if (call.status === "error") {
      this.#calls.delete(call.handle);
      return { status: "error", method: call.method, error: call.error };
    }
    return {
      status: "pending",
      handle: call.handle,
      method: call.method,
      pendingServerRequests: this.#listPendingServerRequests(),
    };
  }

  async #waitForServerRequest(waitMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.#serverRequestWaiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, waitMs);
      timer.unref?.();
      this.#serverRequestWaiters.add(finish);
    });
  }

  #listPendingServerRequests(): unknown[] {
    return [...this.#pendingServerRequests.values()].map((request) => ({
      id: request.id,
      method: request.method,
      params: request.params ?? null,
    }));
  }

  async #readResponseSchema(paramsDefinition: string): Promise<JsonSchema | undefined> {
    if (!paramsDefinition.endsWith("Params")) return undefined;
    const filename = `${paramsDefinition.slice(0, -"Params".length)}Response.json`;
    for (const candidate of [path.join(this.#schemaDir, filename), path.join(this.#schemaDir, "v2", filename)]) {
      try {
        return JSON.parse(await readFile(candidate, "utf8")) as JsonSchema;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
    }
    return undefined;
  }
}

function normalizeWaitMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_WAIT_MS;
  if (!Number.isFinite(value) || value < 0 || value > MAX_WAIT_MS) {
    throw new Error(`wait_ms must be between 0 and ${MAX_WAIT_MS}.`);
  }
  return Math.floor(value);
}

function isModelExecutionMethod(method: string): boolean {
  return method.startsWith("turn/")
    || method === "review/start"
    || method === "thread/compact/start"
    || method === "thread/queue/start"
    || method.startsWith("thread/realtime/");
}

async function generateProtocolSchemas(root: string, schemaDir: string): Promise<void> {
  const child = spawn(process.execPath, [
    codexEntrypoint,
    "app-server",
    "generate-json-schema",
    "--experimental",
    "--out",
    schemaDir,
  ], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [code] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
  if (code !== 0) throw new Error(`Failed to generate Codex app-server protocol schemas: ${stderr.trim() || `exit ${String(code)}`}`);
}

async function loadProtocolUnion(
  schemaDir: string,
  filename: string,
): Promise<{ union: ProtocolUnion; entries: ProtocolEntry[] }> {
  const union = JSON.parse(await readFile(path.join(schemaDir, filename), "utf8")) as ProtocolUnion;
  const entries: ProtocolEntry[] = [];
  for (const variant of union.oneOf ?? []) {
    const method = variant.properties?.method?.enum?.[0];
    if (!method) continue;
    const paramsRef = variant.properties?.params?.$ref;
    const paramsDefinition = paramsRef?.startsWith("#/definitions/")
      ? paramsRef.slice("#/definitions/".length)
      : undefined;
    entries.push({
      method,
      ...(variant.description ? { description: variant.description } : {}),
      ...(paramsDefinition ? { paramsDefinition } : {}),
      variant,
    });
  }
  return { union, entries };
}

function schemaWithDefinitionClosure(union: ProtocolUnion, rootName: string): JsonSchema | undefined {
  const definitions = union.definitions;
  const root = definitions?.[rootName];
  if (!definitions || !root) return undefined;

  const collected: Record<string, JsonSchema> = {};
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const ref = record.$ref;
    if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
      const name = ref.slice("#/definitions/".length);
      if (name !== rootName && !collected[name] && definitions[name]) {
        collected[name] = definitions[name];
        visit(definitions[name]);
      }
    }
    for (const nested of Object.values(record)) visit(nested);
  };
  visit(root);
  return Object.keys(collected).length === 0 ? root : { ...root, definitions: collected };
}

function serializeError(error: unknown): { name: string; message: string; code?: number; data?: JsonValue } {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  const record = error as Error & { code?: unknown; data?: unknown };
  return {
    name: error.name,
    message: error.message,
    ...(typeof record.code === "number" ? { code: record.code } : {}),
    ...(isJsonValue(record.data) ? { data: record.data } : {}),
  };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}
