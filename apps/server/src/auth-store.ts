import envPaths from "env-paths";
import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const configDirectory = envPaths("rce", { suffix: "" }).config;
export const AUTH_FILE = path.join(configDirectory, "auth.json");
export const AUTH_DATABASE = path.join(configDirectory, "auth.sqlite");

export type AuthIdentity = { secret: string };

function parseIdentity(raw: string): AuthIdentity {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object");
  const { secret } = value as Record<string, unknown>;
  if (typeof secret !== "string" || secret.length < 32) throw new Error("secret is missing or too short");
  return { secret };
}

export async function loadOrCreateAuthIdentity(file = AUTH_FILE): Promise<AuthIdentity> {
  try {
    return parseIdentity(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Invalid RCE auth identity at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const identity = { secret: randomBytes(32).toString("base64url") };
  try {
    await writeFile(file, `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return identity;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return parseIdentity(await readFile(file, "utf8"));
    throw error;
  }
}

export function profileIdForSubject(secret: string, subject: string): string {
  if (!subject.trim()) throw new Error("Authenticated token is missing its subject");
  return `rce_${createHmac("sha256", secret).update(`profile:${subject}`).digest("base64url")}`;
}
