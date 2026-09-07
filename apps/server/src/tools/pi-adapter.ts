import type { PiToolName } from "../services/pi.ts";
import type { ToolPlugin } from "./types.ts";

export function piTool(name: PiToolName): ToolPlugin {
  return {
    register(server, context) {
      context.pi.register(server, name);
    },
  };
}
