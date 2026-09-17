import {
  createBashTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type ReadToolInput,
  type WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import type { JsonSchemaType } from "@modelcontextprotocol/server";

type CodingTool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, args: any, signal?: AbortSignal) => Promise<{ content: unknown[] }>;
};

export type PiToolName = "ls" | "find" | "grep" | "write" | "bash";
export type PiResult = { content: unknown[] };

export class PiService {
  #read: CodingTool;
  #tools: Record<PiToolName, CodingTool>;

  private constructor(root: string) {
    this.#read = createReadTool(root);
    this.#tools = createTools(root);
  }

  static create(root: string): PiService {
    return new PiService(root);
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
}

function createTools(root: string): Record<PiToolName, CodingTool> {
  return {
    ls: createLsTool(root),
    find: createFindTool(root),
    grep: createGrepTool(root),
    write: createWriteTool(root),
    bash: createBashTool(root),
  };
}
