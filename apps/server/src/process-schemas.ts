import { t } from "elysia";

export type ProcessArgs = {
  handle: string;
  lines?: number;
  source?: "visible" | "recent" | "recent-unwrapped" | "detection";
  match?: string;
  regex?: string;
  timeout?: number;
  text?: string;
  keys?: string[];
};

const handle = t.String({ minLength: 1 });
const lines = t.Optional(t.Integer({ minimum: 1 }));
const timeout = t.Optional(t.Integer({ minimum: 0 }));
const nonEmpty = t.String({ minLength: 1 });
const source = t.Optional(t.Union([
  t.Literal("visible"),
  t.Literal("recent"),
  t.Literal("recent-unwrapped"),
  t.Literal("detection"),
]));

export const processStartSchema = t.Object({
  command: t.String({ minLength: 1, pattern: "\\S" }),
}, { additionalProperties: false });

export const processSchemas = {
  read: t.Object({ handle, lines, source }, { additionalProperties: false }),
  info: t.Object({ handle }, { additionalProperties: false }),
  stop: t.Object({ handle }, { additionalProperties: false }),
  wait: t.Union([
    t.Object({ handle, lines, match: nonEmpty, timeout }, { additionalProperties: false }),
    t.Object({ handle, lines, regex: nonEmpty, timeout }, { additionalProperties: false }),
  ]),
  send: t.Union([
    t.Object({ handle, text: t.String() }, { additionalProperties: false }),
    t.Object({ handle, keys: t.Array(nonEmpty, { minItems: 1 }) }, { additionalProperties: false }),
  ]),
} as const;
