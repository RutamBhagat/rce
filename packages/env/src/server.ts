import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().int().min(1).max(65535).default(7676),
    RCE_ORIGIN: z.url().refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" &&
        (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
    }, "RCE_ORIGIN must be an HTTPS origin or a local HTTP origin.").transform((value) => new URL(value).origin).default("http://127.0.0.1:7676"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
