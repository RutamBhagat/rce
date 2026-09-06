import { cancel, intro, isCancel, outro, text } from "@clack/prompts";
import {
  completeStoredConfig,
  defaultOrigin,
  parseOrigin,
  parsePort,
  type RceConfig,
  type StoredConfig,
} from "./config.ts";

function validatePort(value: string | undefined): string | undefined {
  try {
    parsePort(value ?? "");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function validateOrigin(value: string | undefined): string | undefined {
  try {
    parseOrigin(value ?? "");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function runSetup(initial: StoredConfig, yes: boolean): Promise<RceConfig | undefined> {
  if (yes) return completeStoredConfig(initial);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive setup requires a terminal. Use 'rce init --yes' or 'rce config set' instead.");
  }

  intro("RCE setup");

  const portAnswer = await text({
    message: "Local port",
    initialValue: String(initial.port ?? 6767),
    validate: validatePort,
  });
  if (isCancel(portAnswer)) {
    cancel("Setup cancelled.");
    return undefined;
  }
  const port = parsePort(portAnswer);

  const originAnswer = await text({
    message: "Public origin",
    initialValue: initial.origin ?? defaultOrigin(port),
    validate: validateOrigin,
  });
  if (isCancel(originAnswer)) {
    cancel("Setup cancelled.");
    return undefined;
  }
  const origin = parseOrigin(originAnswer);

  outro("Configuration saved. Flags and environment variables can override it per run.");
  return { port, origin };
}
