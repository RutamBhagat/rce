import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  platform: "node",
  outDir: "./dist",
  clean: true,
  dts: false,
  deps: {
    // Bake in the local CIMD networking fix so npm consumers do not need
    // Bun's patchedDependencies support. Everything else is a normal dependency.
    alwaysBundle: [/^@better-auth\/cimd(?:\/.*)?$/],
  },
});
