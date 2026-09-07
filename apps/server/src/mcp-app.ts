import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { TOOL_RESULT_RESOURCE_URI } from "./tools/app-tool.ts";

const toolResultHtmlUrl = import.meta.url.endsWith(".ts")
  ? new URL("../dist/tool-result.html", import.meta.url)
  : new URL("./tool-result.html", import.meta.url);

export function registerToolResultApp(
  server: McpServer,
  origin: string,
  readToolResultHtml: () => Promise<string> = () => readFile(toolResultHtmlUrl, "utf8"),
): void {
  const resourceMeta = {
    ui: {
      csp: {
        connectDomains: [],
        resourceDomains: [],
      },
      domain: origin,
      prefersBorder: false,
    },
    "openai/widgetCSP": {
      connect_domains: [],
      resource_domains: [],
    },
    "openai/widgetDomain": origin,
    "openai/widgetPrefersBorder": false,
    "openai/widgetDescription": "Compact, collapsible RCE tool result.",
  };

  registerAppResource(
    server as any,
    "RCE tool result",
    TOOL_RESULT_RESOURCE_URI,
    {
      description: "Inline RCE tool result UI",
      _meta: resourceMeta,
    },
    async () => ({
      contents: [{
        uri: TOOL_RESULT_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readToolResultHtml(),
        _meta: resourceMeta,
      }],
    }),
  );
}
