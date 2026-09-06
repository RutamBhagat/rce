import envPaths from "env-paths";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseOrigin, parsePort, type StoredConfig } from "./config.ts";

const configDirectory = envPaths("rce", { suffix: "" }).config;
export const CONFIG_FILE = path.join(configDirectory, "config.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadStoredConfig(): Promise<StoredConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) throw new Error("expected a JSON object");

    const config: StoredConfig = {};
    if (value.port !== undefined) {
      if (typeof value.port !== "number") throw new Error("port must be a number");
      config.port = parsePort(String(value.port));
    }
    if (value.origin !== undefined) {
      if (typeof value.origin !== "string") throw new Error("origin must be a string");
      config.origin = parseOrigin(value.origin);
    }
    return config;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid RCE config at ${CONFIG_FILE}: ${reason}`);
  }
}

export async function saveStoredConfig(config: StoredConfig): Promise<void> {
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function resetStoredConfig(): Promise<void> {
  await rm(CONFIG_FILE, { force: true });
}
