import { realpathSync } from "node:fs";

export const ROOT = realpathSync(process.cwd());
