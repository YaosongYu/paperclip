import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterIssuesByLookback, issueLookbackTimestamp } from "./preview-legacy-invalid-execution-dispositions.ts";

describe("legacy execution-disposition preview lookback", () => {
  it("scopes default repair candidates by issue creation time, not recent updates", () => {
    const cutoff = new Date("2026-04-27T12:00:00.000Z");
    const oldButRecentlyUpdated = {
      id: "old",
      title: "old blocked issue",
      status: "blocked" as const,
      createdAt: "2026-04-20T12:00:00.000Z",
      updatedAt: "2026-04-29T12:00:00.000Z",
    };
    const newlyCreated = {
      id: "new",
      title: "new blocked issue",
      status: "blocked" as const,
      createdAt: "2026-04-28T12:00:00.000Z",
      updatedAt: "2026-04-28T12:00:00.000Z",
    };

    assert.equal(issueLookbackTimestamp(oldButRecentlyUpdated)?.toISOString(), "2026-04-20T12:00:00.000Z");
    assert.deepEqual(filterIssuesByLookback([oldButRecentlyUpdated, newlyCreated], cutoff).map((issue) => issue.id), [
      "new",
    ]);
  });
});
