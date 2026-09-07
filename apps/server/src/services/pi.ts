import {
  createEventBus,
  createBashTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  DefaultResourceLoader,
  getAgentDir,
  type ExtensionContext,
  type ReadToolInput,
  type WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, isInputRequiredResult, type JsonSchemaType, type McpServer } from "@modelcontextprotocol/server";
import { createMcpAdapter, MCP_STATUS_EVENT, type McpStatusSnapshot } from "pi-mcp-adapter";
import { loadCodexMcpConfig } from "./codex-mcp.ts";
import { McpElicitationBridge } from "./elicitation-bridge.ts";

type CodingTool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, args: any, signal?: AbortSignal) => Promise<{ content: unknown[] }>;
};

export type PiToolName = "ls" | "find" | "grep" | "write" | "bash";
export type PiResult = { content: unknown[] };

export class PiService {
  readonly #root: string;
  readonly #read: CodingTool;
  readonly #tools: Record<PiToolName, CodingTool>;
  readonly #resources: DefaultResourceLoader;
  readonly #elicitation: McpElicitationBridge;
  readonly #mcpServerNames: string[];

  private constructor(
    root: string,
    resources: DefaultResourceLoader,
    elicitation: McpElicitationBridge,
    mcpServerNames: string[],
  ) {
    this.#root = root;
    this.#resources = resources;
    this.#elicitation = elicitation;
    this.#mcpServerNames = mcpServerNames;
    this.#read = createReadTool(root);
    this.#tools = {
      ls: createLsTool(root),
      find: createFindTool(root),
      grep: createGrepTool(root),
      write: createWriteTool(root),
      bash: createBashTool(root),
    };
  }

  static async create(root: string): Promise<PiService> {
    const config = await loadCodexMcpConfig(root).catch((error) => {
      console.warn(`RCE: Codex MCP discovery unavailable; continuing with Pi/Herdr only: ${error instanceof Error ? error.message : String(error)}`);
      return { mcpServers: {}, settings: { directTools: true } };
    });
    const eventBus = createEventBus();
    const elicitation = new McpElicitationBridge();
    const enabledServers = Object.entries(config.mcpServers)
      .filter(([, definition]) => definition.disabled !== true)
      .map(([name]) => name);
    const ready = waitForMcpDiscovery(eventBus, enabledServers);
    const resources = new DefaultResourceLoader({
      cwd: root,
      agentDir: getAgentDir(),
      eventBus,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: enabledServers.length > 0
        ? [{ name: "rce-mcp-adapter", factory: createMcpAdapter({ config }) }]
        : [],
    });
    await resources.reload();
    await startMcpAdapterSession(resources, root, elicitation.ui);
    if (enabledServers.length > 0) await ready;
    return new PiService(root, resources, elicitation, enabledServers);
  }

  get readParameters(): JsonSchemaType {
    return this.#read.parameters as JsonSchemaType;
  }

  description(name: PiToolName): string {
    return this.#tools[name].description;
  }

  parameters(name: PiToolName): JsonSchemaType {
    return this.#tools[name].parameters as JsonSchemaType;
  }

  async read(args: ReadToolInput, signal?: AbortSignal): Promise<PiResult> {
    return this.#read.execute(crypto.randomUUID(), args, signal);
  }

  async execute(name: "write", args: WriteToolInput, signal?: AbortSignal): Promise<PiResult>;
  async execute(name: PiToolName, args: any, signal?: AbortSignal): Promise<PiResult>;
  async execute(name: PiToolName, args: any, signal?: AbortSignal): Promise<PiResult> {
    return this.#tools[name].execute(crypto.randomUUID(), args, signal);
  }

  registerExtensions(server: McpServer): void {
    const reserved = new Set<PiToolName>(["ls", "find", "grep", "write", "bash"]);
    const definitions = new Map<string, any>();
    for (const extension of this.#resources.getExtensions().extensions) {
      for (const registered of extension.tools.values()) {
        const definition = registered.definition;
        if (reserved.has(definition.name as PiToolName)) continue;
        definitions.set(definition.name, definition);
      }
    }

    for (const definition of definitions.values()) {
      server.registerTool(definition.name, {
        description: definition.description,
        inputSchema: fromJsonSchema(definition.parameters as JsonSchemaType),
      }, async (args, ctx) => {
        try {
          const run = async (signal: AbortSignal) => definition.execute(
              crypto.randomUUID(),
              args,
              signal,
              undefined,
              {
                cwd: this.#root,
                mode: "rpc",
                hasUI: true,
                ui: this.#elicitation.ui,
                signal,
              } as ExtensionContext,
            );
          const serverName = resolveMcpServerName(definition.name, this.#mcpServerNames);
          const result = serverName
            ? await this.#elicitation.execute(serverName, definition.name, args, ctx, run)
            : await run(ctx.mcpReq.signal);
          if (isInputRequiredResult(result)) return result;
          const details = result.details as { error?: unknown } | undefined;
          return {
            content: result.content as any,
            ...(details?.error ? { isError: true } : {}),
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
          };
        }
      });
    }
  }
}

async function startMcpAdapterSession(
  resources: DefaultResourceLoader,
  root: string,
  ui: ExtensionContext["ui"],
): Promise<void> {
  const adapter = resources.getExtensions().extensions.find((extension) => extension.path === "<inline:rce-mcp-adapter>");
  if (!adapter) return;
  const context = {
    cwd: root,
    mode: "rpc",
    hasUI: true,
    ui,
    model: undefined,
    modelRegistry: undefined,
    signal: undefined,
  } as unknown as ExtensionContext;
  for (const handler of adapter.handlers.get("session_start") ?? []) {
    await handler({}, context);
  }
}

function resolveMcpServerName(toolName: string, serverNames: string[]): string | undefined {
  return serverNames
    .map((serverName) => ({ serverName, prefix: `${sanitizeServerPrefix(serverName)}_` }))
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(({ prefix }) => toolName.startsWith(prefix))
    ?.serverName;
}

function sanitizeServerPrefix(serverName: string): string {
  return Array.from(serverName, (char) => /^[A-Za-z0-9_-]$/.test(char)
    ? char
    : `_${char.codePointAt(0)!.toString(16)}_`).join("");
}

function waitForMcpDiscovery(eventBus: ReturnType<typeof createEventBus>, expected: string[]): Promise<void> {
  if (expected.length === 0) return Promise.resolve();
  const expectedSet = new Set(expected);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 15_000);
    timer.unref?.();
    eventBus.on(MCP_STATUS_EVENT, (value: unknown) => {
      const snapshot = value as McpStatusSnapshot;
      const statuses = new Map(snapshot.servers?.map((server) => [server.name, server.status]) ?? []);
      if ([...expectedSet].every((name) => {
        const status = statuses.get(name);
        return status === "connected" || status === "cached" || status === "failed" || status === "needs-auth";
      })) finish();
    });
  });
}
