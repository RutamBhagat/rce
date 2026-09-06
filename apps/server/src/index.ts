#!/usr/bin/env node
import { HELP_TEXT, parseCli } from "./config.ts";

try {
  const cli = parseCli();
  if (cli.help) {
    process.stdout.write(HELP_TEXT);
  } else {
    const { startServer } = await import("./server.ts");
    startServer(cli.config);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`rce: ${message}\nRun 'rce --help' for usage.\n`);
  process.exitCode = 1;
}
