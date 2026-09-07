import {
  createBashTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type ReadToolInput,
} from "@earendil-works/pi-coding-agent";
import { fromJsonSchema, type JsonSchemaType, type McpServer } from "@modelcontextprotocol/server";

type CodingTool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, args: any, signal?: AbortSignal) => Promise<{ content: unknown[] }>;
};

export type PiToolName = "ls" | "find" | "grep" | "write" | "bash";
export type PiResult = { content: unknown[] };

export class PiService {
  readonly #read: CodingTool;
  readonly #tools: Record<PiToolName, CodingTool>;

  constructor(root: string) {
    this.#read = createReadTool(root);
    this.#tools = {
      ls: createLsTool(root),
      find: createFindTool(root),
      grep: createGrepTool(root),
      write: createWriteTool(root),
      bash: createBashTool(root),
    };
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
}
