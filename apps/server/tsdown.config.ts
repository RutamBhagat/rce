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
    // Bun's patchedDependencies support. pi-mcp-adapter publishes its main
    // entrypoint as TypeScript, which Node refuses to strip when loaded from
    // node_modules, so bundle it into the RCE executable as well.
    alwaysBundle: [
      /^@better-auth\/cimd(?:\/.*)?$/,
      /^pi-mcp-adapter(?:\/.*)?$/,
    ],
  },
});
