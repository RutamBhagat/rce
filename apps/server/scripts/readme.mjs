import { copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageReadme = fileURLToPath(new URL("../README.md", import.meta.url));
const rootReadme = fileURLToPath(new URL("../../../README.md", import.meta.url));

const command = process.argv[2];

if (command === "copy") {
  await copyFile(rootReadme, packageReadme);
} else if (command === "clean") {
  await rm(packageReadme, { force: true });
} else {
  throw new Error("Usage: node scripts/readme.mjs <copy|clean>");
}
