export function toolError(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
  };
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
