export function coerceOptionalMarkdownDraft(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

export function normalizeOptionalMarkdownPatch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value : null;
}
