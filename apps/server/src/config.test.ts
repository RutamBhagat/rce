import assert from "node:assert/strict";
import test from "node:test";
import {
  completeStoredConfig,
  parseCli,
  resolveServeConfig,
  setStoredValue,
  type CliCommand,
  type StoredConfig,
} from "./config.ts";

const serve = (overrides: Partial<Extract<CliCommand, { kind: "serve" }>> = {}) => ({
  kind: "serve" as const,
  yes: false,
  ...overrides,
});

function withoutConfigEnv<T>(run: () => T): T {
  const origin = process.env.RCE_ORIGIN;
  const port = process.env.PORT;
  delete process.env.RCE_ORIGIN;
  delete process.env.PORT;
  try {
    return run();
  } finally {
    if (origin === undefined) delete process.env.RCE_ORIGIN;
    else process.env.RCE_ORIGIN = origin;
    if (port === undefined) delete process.env.PORT;
    else process.env.PORT = port;
  }
}

test("empty config resolves to loopback defaults", () => {
  withoutConfigEnv(() => {
    assert.deepEqual(resolveServeConfig(serve(), {}), {
      port: 6767,
      origin: "http://127.0.0.1:6767",
    });
  });
});

test("port override moves a saved default loopback origin", () => {
  withoutConfigEnv(() => {
    const saved = completeStoredConfig({});
    assert.deepEqual(resolveServeConfig(serve({ port: "7000" }), saved), {
      port: 7000,
      origin: "http://127.0.0.1:7000",
    });
  });
});

test("port override preserves an explicit public origin", () => {
  withoutConfigEnv(() => {
    const saved: StoredConfig = { port: 6767, origin: "https://rce.example.com" };
    assert.deepEqual(resolveServeConfig(serve({ port: "7000" }), saved), {
      port: 7000,
      origin: "https://rce.example.com",
    });
  });
});

test("persisting a port moves only a default loopback origin", () => {
  assert.deepEqual(
    setStoredValue({ port: 6767, origin: "http://127.0.0.1:6767" }, "port", "7000"),
    { port: 7000, origin: "http://127.0.0.1:7000" },
  );
  assert.deepEqual(
    setStoredValue({ port: 6767, origin: "https://rce.example.com" }, "port", "7000"),
    { port: 7000, origin: "https://rce.example.com" },
  );
});

test("version flags select the version command", () => {
  assert.deepEqual(parseCli(["--version"]), { kind: "version" });
  assert.deepEqual(parseCli(["-v"]), { kind: "version" });
});
