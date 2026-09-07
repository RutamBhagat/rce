// Read semantics adapted from earendil-works/pi (MIT), packages/coding-agent/src/core/tools/read.ts.
import { fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolPlugin } from "./types.ts";

const DEFAULT_MAX_LINES = 2_000;
const DEFAULT_MAX_BYTES = 50 * 1024;

const readSchema = {
  type: "object",
  properties: {
    path: { type: "string", minLength: 1, description: "Path to the file to read (relative or absolute)" },
    offset: { type: "integer", minimum: 1, description: "Line number to start reading from (1-indexed)" },
    limit: { type: "integer", minimum: 1, description: "Maximum number of lines to read" },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

const schema = {
  type: "object",
  properties: {
    reads: { type: "array", minItems: 1, items: readSchema },
  },
  required: ["reads"],
  additionalProperties: false,
} as const;

type ReadInput = { path: string; offset?: number; limit?: number };
type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type TruncationResult = {
  content: string;
  truncated: boolean;
  truncatedBy: "lines" | "bytes" | null;
  outputLines: number;
  firstLineExceedsLimit: boolean;
};

export const readManyTool: ToolPlugin = {
  register(server, context) {
    server.registerTool("read_many", {
      description: `Efficiently read one or more files or line ranges in one call. Relative paths resolve from the RCE project root. Text uses 1-indexed offset/limit and truncates at ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB. Supports png, jpeg, gif, and webp images as attachments.`,
      inputSchema: fromJsonSchema<{ reads: ReadInput[] }>(schema as JsonSchemaType),
    }, async ({ reads }, ctx) => {
      const results = await Promise.all(reads.map(async (input) => {
        try {
          return { input, content: await readOne(context.root, input, ctx.mcpReq.signal) };
        } catch (error) {
          return { input, error: error instanceof Error ? error.message : String(error) };
        }
      }));

      const content = results.flatMap(({ input, content, error }) => {
        const header = { type: "text" as const, text: `=== ${input.path} ===` };
        if (error !== undefined) return [header, { type: "text" as const, text: `Error: ${error}` }];
        return [header, ...content!];
      });
      return { content: content as any };
    });
  },
};

async function readOne(root: string, input: ReadInput, signal?: AbortSignal): Promise<ToolContent[]> {
  throwIfAborted(signal);
  const absolutePath = await resolveReadPath(input.path, root);
  await access(absolutePath, constants.R_OK);
  throwIfAborted(signal);

  const bytes = await readFile(absolutePath, signal ? { signal } : undefined);
  const mimeType = detectImageMimeType(bytes);
  if (mimeType) {
    if (mimeType === "image/bmp") {
      return [{
        type: "text",
        text: "Read image file [image/bmp]\n[Image omitted: BMP conversion is not bundled in RCE.]",
      }];
    }
    return [
      { type: "text", text: `Read image file [${mimeType}]` },
      { type: "image", data: bytes.toString("base64"), mimeType },
    ];
  }

  const textContent = bytes.toString("utf8");
  const allLines = textContent.split("\n");
  const totalFileLines = allLines.length;
  const startLine = input.offset ? Math.max(0, input.offset - 1) : 0;
  const startLineDisplay = startLine + 1;
  if (startLine >= allLines.length) {
    throw new Error(`Offset ${input.offset} is beyond end of file (${allLines.length} lines total)`);
  }

  let selectedContent: string;
  let userLimitedLines: number | undefined;
  if (input.limit !== undefined) {
    const endLine = Math.min(startLine + input.limit, allLines.length);
    selectedContent = allLines.slice(startLine, endLine).join("\n");
    userLimitedLines = endLine - startLine;
  } else {
    selectedContent = allLines.slice(startLine).join("\n");
  }

  const truncation = truncateHead(selectedContent);
  let outputText: string;
  if (truncation.firstLineExceedsLimit) {
    const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine] ?? "", "utf8"));
    outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash with sed/head to inspect that line.]`;
  } else if (truncation.truncated) {
    const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
    const nextOffset = endLineDisplay + 1;
    outputText = truncation.content;
    outputText += truncation.truncatedBy === "lines"
      ? `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`
      : `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
  } else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
    const remaining = allLines.length - (startLine + userLimitedLines);
    const nextOffset = startLine + userLimitedLines + 1;
    outputText = `${truncation.content}\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
  } else {
    outputText = truncation.content;
  }

  return [{ type: "text", text: outputText }];
}

function truncateHead(content: string): TruncationResult {
  const totalBytes = Buffer.byteLength(content, "utf8");
  const lines = splitLinesForCounting(content);
  if (lines.length <= DEFAULT_MAX_LINES && totalBytes <= DEFAULT_MAX_BYTES) {
    return { content, truncated: false, truncatedBy: null, outputLines: lines.length, firstLineExceedsLimit: false };
  }

  if (Buffer.byteLength(lines[0] ?? "", "utf8") > DEFAULT_MAX_BYTES) {
    return { content: "", truncated: true, truncatedBy: "bytes", outputLines: 0, firstLineExceedsLimit: true };
  }

  const output: string[] = [];
  let bytes = 0;
  let truncatedBy: "lines" | "bytes" = "lines";
  for (let index = 0; index < lines.length && index < DEFAULT_MAX_LINES; index += 1) {
    const line = lines[index]!;
    const lineBytes = Buffer.byteLength(line, "utf8") + (index > 0 ? 1 : 0);
    if (bytes + lineBytes > DEFAULT_MAX_BYTES) {
      truncatedBy = "bytes";
      break;
    }
    output.push(line);
    bytes += lineBytes;
  }
  if (output.length >= DEFAULT_MAX_LINES && bytes <= DEFAULT_MAX_BYTES) truncatedBy = "lines";
  return {
    content: output.join("\n"),
    truncated: true,
    truncatedBy,
    outputLines: output.length,
    firstLineExceedsLimit: false,
  };
}

function splitLinesForCounting(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  return lines;
}

async function resolveReadPath(input: string, root: string): Promise<string> {
  const normalized = normalizeInputPath(input);
  const resolved = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(root, normalized);
  const candidates = [
    resolved,
    resolved.replace(/ (AM|PM)\./gi, "\u202f$1."),
    resolved.normalize("NFD"),
    resolved.replace(/'/g, "\u2019"),
    resolved.normalize("NFD").replace(/'/g, "\u2019"),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      // Try Pi-compatible macOS filename variants before returning the original path.
    }
  }
  return resolved;
}

function normalizeInputPath(input: string): string {
  let normalized = input.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return path.join(homedir(), normalized.slice(2));
  if (normalized.startsWith("file://")) return fileURLToPath(normalized);
  return normalized;
}

function detectImageMimeType(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return undefined;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
}
