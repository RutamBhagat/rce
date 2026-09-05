import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function herdr<T>(...args: string[]): Promise<T> {
  const { stdout } = await exec("herdr", args, { maxBuffer: 4 * 1024 * 1024 });
  const response = stdout.trim() ? JSON.parse(stdout) : {};
  if (response.error) throw new Error(response.error.message);
  return response.result;
}
