import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { TOOL_RESULT_RESOURCE_URI } from "./tools/app-tool.ts";

const toolResultHtmlUrl = import.meta.url.endsWith(".ts")
  ? new URL("../dist/tool-result.html", import.meta.url)
  : new URL("./tool-result.html", import.meta.url);

export function registerToolResultApp(server: McpServer): void {
  registerAppResource(
    server as any,
    "RCE tool result",
    TOOL_RESULT_RESOURCE_URI,
    {
      description: "Inline RCE tool result UI",
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [{
        uri: TOOL_RESULT_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(toolResultHtmlUrl, "utf8"),
      }],
    }),
  );
}
