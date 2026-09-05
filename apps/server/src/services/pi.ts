import {
  createBashTool,
  createEditTool,
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

export type PiToolName = "read" | "ls" | "find" | "grep" | "write" | "edit" | "bash";
export type PiResult = { content: unknown[] };

export class PiService {
  readonly #tools: Record<PiToolName, CodingTool>;

  constructor(root: string) {
    this.#tools = {
      read: createReadTool(root),
      ls: createLsTool(root),
      find: createFindTool(root),
      grep: createGrepTool(root),
      write: createWriteTool(root),
      edit: createEditTool(root),
      bash: createBashTool(root),
    };
  }

  get readParameters(): JsonSchemaType {
    return this.#tools.read.parameters as JsonSchemaType;
  }

  async read(args: ReadToolInput, signal?: AbortSignal): Promise<PiResult> {
    return this.#tools.read.execute(crypto.randomUUID(), args, signal);
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
