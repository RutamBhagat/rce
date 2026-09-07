import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const home = await mkdtemp(path.join(os.tmpdir(), "rce-smoke-home-"));
const port = await freePort();
let output = "";

const child = spawn(process.execPath, ["dist/index.mjs", "--yes", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, HOME: home },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

try {
  await waitForReady(child, () => output);
  process.stdout.write(`RCE built CLI started successfully on port ${port}.\n`);
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(home, { recursive: true, force: true });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate smoke-test port.");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForReady(process, getOutput) {
  const timeoutMs = 15_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (getOutput().includes('"msg":"server.ready"')) return;
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`Built RCE CLI exited before startup:\n${getOutput()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Built RCE CLI did not become ready within ${timeoutMs}ms:\n${getOutput()}`);
}
