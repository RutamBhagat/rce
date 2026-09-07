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
} from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, type JsonSchemaType, type McpServer } from "@modelcontextprotocol/server";
import { createMcpAdapter, MCP_STATUS_EVENT, type McpStatusSnapshot } from "pi-mcp-adapter";
import { loadCodexMcpConfig } from "./codex-mcp.ts";

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

  private constructor(root: string, resources: DefaultResourceLoader) {
    this.#root = root;
    this.#resources = resources;
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
    if (enabledServers.length > 0) await ready;
    return new PiService(root, resources);
  }

  get readParameters(): JsonSchemaType {
    return this.#read.parameters as JsonSchemaType;
  }

  async read(args: ReadToolInput, signal?: AbortSignal): Promise<PiResult> {
    return this.#read.execute(crypto.randomUUID(), args, signal);
  }

  register(server: McpServer, name: PiToolName): void {
    const tool = this.#tools[name];
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema(tool.parameters as JsonSchemaType),
    }, async (args, ctx) => {
      try {
        const result = await tool.execute(crypto.randomUUID(), args, ctx.mcpReq.signal);
        return { content: result.content as any };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
        };
      }
    });
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
          const result = await definition.execute(
            crypto.randomUUID(),
            args,
            ctx.mcpReq.signal,
            undefined,
            {
              cwd: this.#root,
              mode: "print",
              hasUI: false,
              signal: ctx.mcpReq.signal,
            } as ExtensionContext,
          );
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
