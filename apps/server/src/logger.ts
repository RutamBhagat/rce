import pino from "pino";

const transport = process.stdout.isTTY
  ? pino.transport({
      target: "pino-pretty",
      options: { colorize: true, singleLine: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
    })
  : undefined;

export const log = pino({
  level: process.env.LOG_LEVEL ?? "debug",
  redact: {
    paths: [
      "authorization",
      "cookie",
      "setCookie",
      "code",
      "codeVerifier",
      "clientAssertion",
      "refreshToken",
      "accessToken",
      "oauthQuery",
    ],
    censor: "[redacted]",
  },
}, transport);
