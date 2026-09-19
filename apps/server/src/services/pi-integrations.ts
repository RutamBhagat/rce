import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import path from "node:path";

type StoredCredential = {
  type?: string;
  key?: string;
};

type PiAuth = Record<string, StoredCredential | undefined>;
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function settingsEnv(settings: object): Record<string, unknown> {
  const value = Reflect.get(settings, "env");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveSettingsEnv(root: string, name: string): string | undefined {
  const manager = SettingsManager.create(root);
  const merged = {
    ...settingsEnv(manager.getGlobalSettings()),
    ...settingsEnv(manager.getProjectSettings()),
  };
  const raw = merged[name];
  if (!isScalar(raw)) return undefined;

  const seen = new Set<string>([name]);
  const resolveValue = (value: string): string => value.replace(
    /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced: string | undefined, bare: string | undefined) => {
      if (match === "$$") return "$";
      const key = braced ?? bare;
      if (!key || seen.has(key)) return "";
      const nested = merged[key];
      if (isScalar(nested)) {
        seen.add(key);
        const resolved = resolveValue(String(nested));
        seen.delete(key);
        return resolved;
      }
      return process.env[key] ?? "";
    },
  );

  return resolveValue(String(raw));
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export async function resolvePiApiKey(
  root: string,
  provider: "parallel",
  envName: "PARALLEL_API_KEY",
): Promise<string | undefined> {
  const auth = await readJson<PiAuth>(path.join(getAgentDir(), "auth.json"));
  const credential = auth?.[provider];
  if (credential?.type === "api_key" && credential.key?.trim()) return credential.key.trim();

  const configured = resolveSettingsEnv(root, envName);
  if (configured?.trim()) return configured.trim();

  const fromEnv = process.env[envName];
  return fromEnv?.trim() || undefined;
}

export function resolvePiEnvironment(root: string, name: string): string | undefined {
  const configured = resolveSettingsEnv(root, name);
  if (configured !== undefined) return configured;
  return process.env[name];
}
