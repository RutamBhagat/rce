import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { JsonView, collapseAllNested, darkStyles, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import "./tool-ui.css";

type ToolStatus = "connecting" | "running" | "completed" | "failed" | "cancelled";
type ToolResult = {
  content?: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function RceToolApp() {
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ToolResult>();
  const [status, setStatus] = useState<ToolStatus>("connecting");
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | undefined>(undefined);

  const { app, error } = useApp({
    appInfo: { name: "RCE Tool Result", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolinput = ({ arguments: args }) => {
        startedAt.current = performance.now();
        setElapsedMs(0);
        setInput(args ?? {});
        setResult(undefined);
        setStatus("running");
      };
      createdApp.ontoolresult = (nextResult) => {
        const typedResult = nextResult as ToolResult;
        const measured = startedAt.current === undefined ? undefined : performance.now() - startedAt.current;
        setElapsedMs(serverDuration(typedResult) ?? measured ?? 0);
        setResult(typedResult);
        setStatus(typedResult.isError ? "failed" : "completed");
      };
      createdApp.ontoolcancelled = () => {
        if (startedAt.current !== undefined) setElapsedMs(performance.now() - startedAt.current);
        setStatus("cancelled");
      };
      createdApp.onhostcontextchanged = (nextContext) => {
        setHostContext((current) => ({ ...current, ...nextContext }));
        applyHostContext(nextContext);
      };
    },
  });

  useEffect(() => {
    if (!app) return;
    const context = app.getHostContext();
    if (!context) return;
    setHostContext(context);
    applyHostContext(context);
  }, [app]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      if (startedAt.current !== undefined) setElapsedMs(performance.now() - startedAt.current);
    }, 50);
    return () => window.clearInterval(timer);
  }, [status]);

  const structured = result?.structuredContent ?? {};
  const toolName = hostContext?.toolInfo?.tool.name
    ?? (typeof structured.toolName === "string" ? structured.toolName : undefined)
    ?? "tool";
  const theme = hostContext?.theme ?? "light";

  if (error) return <Shell><div className="error">Unable to connect tool UI: {error.message}</div></Shell>;

  return (
    <Shell>
      <ToolRenderer toolName={toolName} input={input} result={result} theme={theme} />
      <ExecutionStatus status={status} elapsedMs={elapsedMs} serverDurationMs={serverDuration(result)} />
    </Shell>
  );
}

function ToolRenderer({ toolName, input, result, theme }: {
  toolName: string;
  input: Record<string, unknown>;
  result?: ToolResult;
  theme: "light" | "dark";
}) {
  const structured = result?.structuredContent ?? {};
  if (toolName === "write" || toolName === "apply_patch") {
    return <DiffTool diff={asRecord(structured.diff)} theme={theme} />;
  }
  if (toolName.startsWith("process_")) {
    return <ProcessTool input={input} process={asRecord(structured.process)} theme={theme} />;
  }
  return <GenericTool toolName={toolName} result={result} theme={theme} />;
}

function DiffTool({ diff, theme }: { diff?: Record<string, unknown>; theme: "light" | "dark" }) {
  const [expanded, setExpanded] = useState(true);
  const files = Array.isArray(diff?.files) ? diff.files.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
  const additions = numberValue(diff?.additions);
  const deletions = numberValue(diff?.deletions);
  const patch = typeof diff?.patch === "string" ? diff.patch : "";
  const title = files.length === 1 ? "Edit File" : "Edit Files";

  useEffect(() => {
    setExpanded(true);
  }, [patch]);

  if (!diff) return <PendingCard title="Edit File" />;

  return (
    <section className="tool-card">
      <button
        className="tool-header diff-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="diff-heading">
          <span className="tool-title">{title}</span>
          <span className="file-list">
            {files.map((file, index) => (
              <span key={`${String(file.path)}-${index}`}>
                {file.status === "renamed" && file.oldPath !== file.newPath
                  ? `${String(file.oldPath)} → ${String(file.newPath)}`
                  : String(file.path ?? "file")}
              </span>
            ))}
          </span>
        </span>
        <span className="diff-actions">
          <span className="diff-stats"><span>+{additions}</span> <span>−{deletions}</span></span>
          <span className={`chevron${expanded ? " expanded" : ""}`} aria-hidden="true">⌄</span>
        </span>
      </button>
      {expanded && (
        <div className="diff-frame">
          {patch
            ? <PatchDiff patch={patch} disableWorkerPool options={{ diffStyle: "unified", theme: theme === "dark" ? "pierre-dark" : "pierre-light" }} />
            : <div className="empty-state">No textual content changes.</div>}
        </div>
      )}
    </section>
  );
}

function ProcessTool({ input, process, theme }: {
  input: Record<string, unknown>;
  process?: Record<string, unknown>;
  theme: "light" | "dark";
}) {
  const details = asRecord(process?.details);
  const handle = stringValue(process?.handle ?? input.handle);
  const command = stringValue(process?.command ?? input.command ?? details?.command);
  const state = stringValue(process?.state);
  const processElapsed = numberValue(process?.elapsedMs);
  const output = stringValue(process?.output);
  const matchedLine = stringValue(process?.matchedLine);

  return (
    <section className="tool-card">
      <header className="tool-header process-header">
        <div>
          <div className="tool-title">Process</div>
          {command && <div className="command">{command}</div>}
        </div>
      </header>
      <dl className="process-meta">
        {handle && <><dt>handle</dt><dd>{handle}</dd></>}
        {state && <><dt>state</dt><dd>{state}</dd></>}
        {processElapsed > 0 && <><dt>elapsed</dt><dd>{formatSeconds(processElapsed, 1)}</dd></>}
      </dl>
      {output && <TerminalOutput output={output} />}
      {!output && matchedLine && <TerminalOutput output={matchedLine} label="Matched" />}
      {details && <DetailsViewer data={details} theme={theme} />}
    </section>
  );
}

function GenericTool({ toolName, result, theme }: { toolName: string; result?: ToolResult; theme: "light" | "dark" }) {
  const text = textContent(result);
  const details = useMemo(() => {
    if (!result?.structuredContent) return undefined;
    const { serverDurationMs: _duration, toolName: _toolName, ...rest } = result.structuredContent;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }, [result]);

  return (
    <section className="tool-card">
      <header className="tool-header"><div className="tool-title">{friendlyName(toolName)}</div></header>
      {text && <pre className="text-result">{text}</pre>}
      {details && <DetailsViewer data={details} theme={theme} initiallyOpen={!text} />}
    </section>
  );
}

function TerminalOutput({ output, label = "Output" }: { output: string; label?: string }) {
  return <div className="output-block"><div className="section-label">{label}</div><pre>{output}</pre></div>;
}

function DetailsViewer({ data, theme, initiallyOpen = false }: { data: Record<string, unknown>; theme: "light" | "dark"; initiallyOpen?: boolean }) {
  return (
    <details className="details" open={initiallyOpen}>
      <summary>Details</summary>
      <div className="json-view"><JsonView data={data} shouldExpandNode={collapseAllNested} style={theme === "dark" ? darkStyles : defaultStyles} /></div>
    </details>
  );
}

function ExecutionStatus({ status, elapsedMs, serverDurationMs }: { status: ToolStatus; elapsedMs: number; serverDurationMs?: number }) {
  const duration = status === "running" ? elapsedMs : (serverDurationMs ?? elapsedMs);
  const label = status === "running" ? "Running"
    : status === "completed" ? "Completed"
      : status === "failed" ? "Failed"
        : status === "cancelled" ? "Cancelled"
          : "Connecting";
  const decimals = status === "running" ? 1 : 2;
  return <footer className={`execution-status ${status}`}>{label}{status !== "connecting" ? ` · ${formatSeconds(duration, decimals)}` : ""}</footer>;
}

function PendingCard({ title }: { title: string }) {
  return <section className="tool-card"><header className="tool-header"><div className="tool-title">{title}</div></header></section>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="app-shell">{children}</main>;
}

function applyHostContext(context: McpUiHostContext): void {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

function serverDuration(result?: ToolResult): number | undefined {
  const value = result?.structuredContent?.serverDurationMs;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function textContent(result?: ToolResult): string {
  return result?.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n") ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function friendlyName(name: string): string {
  return name.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatSeconds(milliseconds: number, decimals: number): string {
  return `${(milliseconds / 1000).toFixed(decimals)}s`;
}

createRoot(document.getElementById("root")!).render(<RceToolApp />);
