import { describe, expect, it } from "vitest";
import {
  coerceOptionalMarkdownDraft,
  normalizeOptionalMarkdownPatch,
} from "./agent-config-form-utils";

describe("agent-config-form-utils", () => {
  it("keeps optional markdown drafts string-backed while editing", () => {
    expect(coerceOptionalMarkdownDraft(null)).toBe("");
    expect(coerceOptionalMarkdownDraft(undefined)).toBe("");
    expect(coerceOptionalMarkdownDraft("Writes code")).toBe("Writes code");
  });

  it("normalizes blank optional markdown back to null for persistence", () => {
    expect(normalizeOptionalMarkdownPatch("")).toBeNull();
    expect(normalizeOptionalMarkdownPatch("   ")).toBeNull();
    expect(normalizeOptionalMarkdownPatch(null)).toBeNull();
    expect(normalizeOptionalMarkdownPatch("Keeps incidents under control")).toBe(
      "Keeps incidents under control",
    );
  });
});
