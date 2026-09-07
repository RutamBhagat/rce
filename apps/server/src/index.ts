#!/usr/bin/env node
import {
  HELP_TEXT,
  hasRuntimeOverride,
  isCompleteConfig,
  parseCli,
  resolveServeConfig,
  setStoredValue,
} from "./config.ts";
import { CONFIG_FILE, loadStoredConfig, resetStoredConfig, saveStoredConfig } from "./config-store.ts";
import { runSetup } from "./setup.ts";
import { VERSION } from "./version.ts";

async function main(): Promise<void> {
  const command = parseCli();
  if (command.kind === "help") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (command.kind === "version") {
    process.stdout.write(`rce-mcp ${VERSION}\n`);
    return;
  }

  const saved = await loadStoredConfig();

  if (command.kind === "config-get") {
    process.stdout.write(`${JSON.stringify(saved, null, 2)}\n`);
    return;
  }

  if (command.kind === "config-set") {
    const next = setStoredValue(saved, command.key, command.value);
    await saveStoredConfig(next);
    process.stdout.write(`Saved ${command.key} in ${CONFIG_FILE}\n`);
    return;
  }

  if (command.kind === "config-unset") {
    const next = { ...saved };
    delete next[command.key];
    if (Object.keys(next).length === 0) await resetStoredConfig();
    else await saveStoredConfig(next);
    process.stdout.write(`Removed ${command.key} from saved config.\n`);
    return;
  }

  if (command.kind === "config-reset") {
    await resetStoredConfig();
    process.stdout.write("Removed saved RCE configuration.\n");
    return;
  }

  if (command.kind === "init") {
    const configured = await runSetup(saved, command.yes);
    if (!configured) return;
    await saveStoredConfig(configured);
    if (command.yes) process.stdout.write(`Saved defaults in ${CONFIG_FILE}\n`);
    return;
  }

  let persistent = saved;
  if (!isCompleteConfig(persistent)) {
    if (command.yes) {
      const configured = await runSetup(persistent, true);
      if (!configured) return;
      persistent = configured;
      await saveStoredConfig(persistent);
    } else if (!hasRuntimeOverride(command)) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("RCE is not configured. Run 'rce init', use 'rce --yes', or pass --origin/--port for a one-off run.");
      }
      const configured = await runSetup(persistent, false);
      if (!configured) return;
      persistent = configured;
      await saveStoredConfig(persistent);
    }
  }

  const config = resolveServeConfig(command, persistent);
  const { startServer } = await import("./server.ts");
  await startServer(config);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`rce: ${message}\nRun 'rce --help' for usage.\n`);
  process.exitCode = 1;
}
