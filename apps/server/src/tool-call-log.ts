import { log } from "./logger.ts";

export const TOOL_LOG_PAYLOAD_LIMIT = 4_000;

type ToolCallEvent = {
  id: number;
  name: string;
  phase: "start" | "success" | "error";
  payload: unknown;
  elapsedMs?: number;
};

let nextId = 1;

function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "bigint") return `${nested}n`;
      if (nested && typeof nested === "object") {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      return nested;
    }, 2);
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function capPayload(value: unknown): string {
  const serialized = serialize(value);
  if (serialized.length <= TOOL_LOG_PAYLOAD_LIMIT) return serialized;
  const omitted = serialized.length - TOOL_LOG_PAYLOAD_LIMIT;
  return `${serialized.slice(0, TOOL_LOG_PAYLOAD_LIMIT)}\n… [truncated ${omitted.toLocaleString("en-US")} chars]`;
}

function formatBody(value: unknown): string {
  const body = serialize(value).split("\n").map((line) => `│ ${line}`).join("\n");
  if (body.length <= TOOL_LOG_PAYLOAD_LIMIT) return body;

  let suffix = "";
  let available = TOOL_LOG_PAYLOAD_LIMIT;
  for (let attempt = 0; attempt < 2; attempt++) {
    const omitted = body.length - available;
    suffix = `\n│ … [truncated ${omitted.toLocaleString("en-US")} display chars]`;
    available = TOOL_LOG_PAYLOAD_LIMIT - suffix.length;
  }
  return `${body.slice(0, available)}${suffix}`;
}

function paint(value: string, code: number, color: boolean): string {
  return color ? `\u001b[${code}m${value}\u001b[0m` : value;
}

export function formatToolCall(event: ToolCallEvent, color = false): string {
  const status = event.phase === "start" ? "START" : event.phase === "success" ? "OK" : "ERROR";
  const statusColor = event.phase === "start" ? 36 : event.phase === "success" ? 32 : 31;
  const duration = event.elapsedMs === undefined ? "" : ` · ${event.elapsedMs.toFixed(1)}ms`;
  const label = event.phase === "start" ? "input" : "result";
  const header = paint(`TOOL #${event.id} ${status}`, statusColor, color);
  const body = formatBody(event.payload);
  return `\n┌─ ${header} · ${event.name}${duration}\n│ ${label}\n${body}\n└────────────────────────────────────────────────────────────\n`;
}

export function allocateToolCallId(): number {
  return nextId++;
}

export function writeToolCall(event: ToolCallEvent): void {
  try {
    if (process.stdout.isTTY) {
      process.stdout.write(formatToolCall(event, process.env.NO_COLOR === undefined));
      return;
    }

    log.info({
      component: "tool",
      callId: event.id,
      tool: event.name,
      phase: event.phase,
      elapsedMs: event.elapsedMs === undefined ? undefined : Math.round(event.elapsedMs * 10) / 10,
      payload: capPayload(event.payload),
    }, "tool.call");
  } catch {
    // Observability must never change tool behavior.
  }
}
