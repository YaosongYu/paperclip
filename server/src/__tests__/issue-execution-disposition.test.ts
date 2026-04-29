import { describe, expect, it } from "vitest";
import type { IssueStatus } from "@paperclipai/shared";
import type {
  IssueExecutionDisposition,
  IssueExecutionInvalidReason,
  IssueExecutionWaitingPath,
} from "@paperclipai/shared";
import {
  classifyIssueExecutionDisposition,
  type IssueExecutionStateVector,
} from "../services/issue-execution-disposition.ts";

const agentId = "agent-1";
const humanId = "user-1";

function state(
  input: Partial<IssueExecutionStateVector> & {
    issue?: Partial<IssueExecutionStateVector["issue"]>;
  },
): IssueExecutionStateVector {
  const issue = {
    id: "issue-1",
    status: "todo" as IssueStatus,
    assigneeAgentId: agentId,
    assigneeUserId: null,
    ...input.issue,
  };

  return {
    agent: issue.assigneeAgentId
      ? { id: issue.assigneeAgentId, status: "idle" }
      : null,
    ...input,
    issue,
  };
}

function classify(input: IssueExecutionStateVector) {
  const disposition = classifyIssueExecutionDisposition(input);
  expect(disposition.kind).toBeTruthy();
  return disposition;
}

function expectDisposition(
  input: IssueExecutionStateVector,
  expected: Partial<IssueExecutionDisposition> & { kind: IssueExecutionDisposition["kind"] },
) {
  expect(classify(input)).toMatchObject(expected);
}

describe("issue execution disposition classifier", () => {
  it.each([
    ["row 1 terminal done", state({ issue: { status: "done" } }), { kind: "terminal" }],
    [
      "row 1 terminal cancelled",
      state({ issue: { status: "cancelled" } }),
      { kind: "terminal" },
    ],
    [
      "row 2 dual owner",
      state({ issue: { assigneeAgentId: agentId, assigneeUserId: humanId } }),
      { kind: "invalid", reason: "dual_assignee" },
    ],
    [
      "row 3 backlog rests",
      state({ issue: { status: "backlog" } }),
      { kind: "resting" },
    ],
    [
      "row 4 unassigned todo rests",
      state({ issue: { assigneeAgentId: null, assigneeUserId: null }, agent: null }),
      { kind: "resting" },
    ],
    [
      "row 5 queued todo is live",
      state({ execution: { queuedWake: true } }),
      { kind: "live", path: "queued_wake" },
    ],
    ["row 6 assigned todo dispatches", state({}), { kind: "dispatchable", wakeTarget: agentId }],
    [
      "row 7 assigned todo waits on interaction",
      state({ waits: { pendingInteraction: "live" } }),
      { kind: "waiting", path: "interaction" },
    ],
    [
      "row 8 failed todo is dispatch recoverable",
      state({ latestRun: { latestRunStatus: "failed", recoveryAttemptRemaining: true } }),
      { kind: "recoverable_by_control_plane", recovery: "dispatch" },
    ],
    [
      "row 9 paused assignee escalates",
      state({ agent: { id: agentId, status: "paused" } }),
      { kind: "human_escalation_required", owner: "manager" },
    ],
    [
      "row 10 pause hold waits",
      state({ issue: { status: "in_progress" }, waits: { pauseHold: true } }),
      { kind: "waiting", path: "pause_hold" },
    ],
    [
      "row 11 active in-progress run is live",
      state({ issue: { status: "in_progress" }, execution: { activeRun: true } }),
      { kind: "live", path: "active_run" },
    ],
    [
      "row 12 queued in-progress continuation is live",
      state({ issue: { status: "in_progress" }, execution: { scheduledRetry: true } }),
      { kind: "live", path: "scheduled_retry" },
    ],
    [
      "row 13 in-progress waits on approval",
      state({ issue: { status: "in_progress" }, waits: { pendingApproval: "live" } }),
      { kind: "waiting", path: "approval" },
    ],
    [
      "row 14 failed in-progress run is continuation recoverable",
      state({
        issue: { status: "in_progress" },
        latestRun: { latestRunStatus: "timed_out", recoveryAttemptRemaining: true },
      }),
      { kind: "recoverable_by_control_plane", recovery: "continuation" },
    ],
    [
      "row 15 successful runnable progress is continuable",
      state({
        issue: { status: "in_progress" },
        latestRun: {
          latestRunStatus: "succeeded",
          livenessState: "advanced",
          nextAction: "runnable",
          continuationAttempt: 0,
          maxContinuationAttempts: 2,
        },
      }),
      { kind: "agent_continuable", continuationAttempt: 0, maxAttempts: 2 },
    ],
    [
      "row 16 ambiguous successful progress escalates",
      state({
        issue: { status: "in_progress" },
        latestRun: {
          latestRunStatus: "succeeded",
          livenessState: "advanced",
          nextAction: "manager_review",
          continuationAttempt: 0,
          maxContinuationAttempts: 2,
        },
      }),
      { kind: "human_escalation_required", owner: "manager" },
    ],
    [
      "row 17 human review assignee waits",
      state({
        issue: { status: "in_review", assigneeAgentId: null, assigneeUserId: humanId },
        agent: null,
      }),
      { kind: "waiting", path: "human_owner" },
    ],
    [
      "row 18 agent review participant waits",
      state({ issue: { status: "in_review" }, waits: { participant: "valid" } }),
      { kind: "waiting", path: "participant" },
    ],
    [
      "row 19 bare agent review is invalid",
      state({ issue: { status: "in_review" } }),
      { kind: "invalid", reason: "in_review_without_action_path" },
    ],
    [
      "row 20 healthy blocker chain waits",
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "todo",
              assigneeAgentId: agentId,
              assigneeUserId: null,
            },
            disposition: { kind: "dispatchable", wakeTarget: agentId },
          },
        ],
      }),
      { kind: "waiting", path: "blocker_chain" },
    ],
    [
      "row 21 cancelled blocker leaf is invalid",
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "cancelled",
              assigneeAgentId: agentId,
              assigneeUserId: null,
            },
          },
        ],
      }),
      { kind: "invalid", reason: "blocked_by_cancelled_issue" },
    ],
    [
      "row 22 blocked external owner waits",
      state({ issue: { status: "blocked" }, waits: { externalOwnerAction: true } }),
      { kind: "waiting", path: "external_owner_action" },
    ],
    [
      "row 23 blocked without path is invalid",
      state({ issue: { status: "blocked" } }),
      { kind: "invalid", reason: "blocked_without_action_path" },
    ],
    [
      "row 24 human-owned non-terminal waits",
      state({
        issue: { status: "todo", assigneeAgentId: null, assigneeUserId: humanId },
        agent: null,
      }),
      { kind: "waiting", path: "human_owner" },
    ],
    [
      "row 25 open productivity review waits",
      state({ issue: { status: "in_progress" }, waits: { openProductivityReviewIssue: true } }),
      { kind: "waiting", path: "review_artifact" },
    ],
    [
      "row 26 recovery issue failure escalates to recovery owner",
      state({
        issue: { status: "in_progress", originKind: "stranded_issue_recovery" },
        latestRun: { latestRunStatus: "failed", recoveryAttemptRemaining: true },
      }),
      { kind: "human_escalation_required", owner: "recovery_owner" },
    ],
  ] satisfies Array<[string, IssueExecutionStateVector, Partial<IssueExecutionDisposition> & { kind: IssueExecutionDisposition["kind"] }]>)(
    "%s",
    (_name, input, expected) => {
      expectDisposition(input, expected);
    },
  );

  it.each([
    [
      "invalid-review-leaf-pi-autoresearch",
      state({ issue: { status: "in_review" } }),
      "invalid",
      "in_review_without_action_path",
      undefined,
    ],
    [
      "invalid-review-leaf-object-detection",
      state({ issue: { status: "in_review" } }),
      "invalid",
      "in_review_without_action_path",
      undefined,
    ],
    [
      "healthy-review-participant",
      state({ issue: { status: "in_review" }, waits: { participant: "valid" } }),
      "waiting",
      undefined,
      "participant",
    ],
    [
      "healthy-review-confirmation",
      state({ issue: { status: "in_progress" }, waits: { pendingInteraction: "live" } }),
      "waiting",
      undefined,
      "interaction",
    ],
    [
      "healthy-linked-approval",
      state({ waits: { pendingApproval: "live" } }),
      "waiting",
      undefined,
      "approval",
    ],
    [
      "productive-terminal-run-runnable-next-action",
      state({
        issue: { status: "in_progress" },
        latestRun: {
          latestRunStatus: "succeeded",
          livenessState: "advanced",
          nextAction: "runnable",
          continuationAttempt: 1,
          maxContinuationAttempts: 2,
        },
      }),
      "agent_continuable",
      undefined,
      undefined,
    ],
    [
      "productive-terminal-run-no-next-action",
      state({
        issue: { status: "in_progress" },
        latestRun: {
          latestRunStatus: "succeeded",
          livenessState: "advanced",
          nextAction: "unknown",
          continuationAttempt: 1,
          maxContinuationAttempts: 2,
        },
      }),
      "human_escalation_required",
      undefined,
      undefined,
    ],
    [
      "true-failed-continuation-recovery",
      state({
        issue: { status: "in_progress" },
        latestRun: { latestRunStatus: "cancelled", recoveryAttemptRemaining: true },
      }),
      "recoverable_by_control_plane",
      undefined,
      undefined,
    ],
    [
      "explicit-productivity-review-hold",
      state({ issue: { status: "in_progress" }, waits: { openProductivityReviewIssue: true } }),
      "waiting",
      undefined,
      "review_artifact",
    ],
    [
      "productivity-threshold-without-review",
      state({ issue: { status: "in_progress" }, waits: { productivityReviewNeeded: true } }),
      "human_escalation_required",
      undefined,
      undefined,
    ],
    [
      "healthy-long-active-run",
      state({ issue: { status: "in_progress" }, execution: { activeRun: true } }),
      "live",
      undefined,
      undefined,
    ],
    [
      "recovery-of-recovery-failure",
      state({
        issue: { status: "in_progress", originKind: "stranded_issue_recovery" },
        latestRun: { latestRunStatus: "failed", recoveryAttemptRemaining: true },
      }),
      "human_escalation_required",
      undefined,
      undefined,
    ],
    [
      "normal-source-recovery-dedupe",
      state({
        issue: { status: "in_progress" },
        latestRun: { latestRunStatus: "failed", recoveryAttemptRemaining: false },
      }),
      "human_escalation_required",
      undefined,
      undefined,
    ],
    [
      "blocked-chain-healthy-leaf",
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "in_progress",
              assigneeAgentId: agentId,
              assigneeUserId: null,
            },
            disposition: { kind: "live", path: "active_run" },
          },
        ],
      }),
      "waiting",
      undefined,
      "blocker_chain",
    ],
    [
      "blocked-chain-cancelled-leaf",
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "cancelled",
              assigneeAgentId: agentId,
              assigneeUserId: null,
            },
          },
        ],
      }),
      "invalid",
      "blocked_by_cancelled_issue",
      undefined,
    ],
    [
      "budget-hard-stop",
      state({ issue: { status: "in_progress" }, gates: { budgetBlocked: true } }),
      "human_escalation_required",
      undefined,
      undefined,
    ],
    [
      "pause-held-subtree",
      state({ issue: { status: "in_progress" }, waits: { pauseHold: true } }),
      "waiting",
      undefined,
      "pause_hold",
    ],
    [
      "dual-assignee-write",
      state({ issue: { assigneeAgentId: agentId, assigneeUserId: humanId } }),
      "invalid",
      "dual_assignee",
      undefined,
    ],
  ] satisfies Array<
    [
      string,
      IssueExecutionStateVector,
      IssueExecutionDisposition["kind"],
      IssueExecutionInvalidReason | undefined,
      IssueExecutionWaitingPath | undefined,
    ]
  >)("%s fixture", (_name, input, expectedKind, expectedReason, expectedPath) => {
    const disposition = classify(input);
    expect(disposition.kind).toBe(expectedKind);
    if (expectedReason) expect(disposition).toMatchObject({ reason: expectedReason });
    if (expectedPath) expect(disposition).toMatchObject({ path: expectedPath });
  });

  it("does not treat stale waits as durable coverage", () => {
    expectDisposition(
      state({ issue: { status: "in_review" }, waits: { pendingInteraction: "stale" } }),
      { kind: "invalid", reason: "in_review_without_action_path" },
    );
    expectDisposition(
      state({
        issue: { status: "in_progress" },
        waits: { pendingApproval: "stale" },
        latestRun: {
          latestRunStatus: "succeeded",
          livenessState: "advanced",
          nextAction: "runnable",
          continuationAttempt: 0,
          maxContinuationAttempts: 2,
        },
      }),
      { kind: "agent_continuable", continuationAttempt: 0, maxAttempts: 2 },
    );
  });

  it("rejects malformed review participants as invalid wait paths", () => {
    expectDisposition(
      state({ issue: { status: "in_review" }, waits: { participant: "invalid" } }),
      { kind: "invalid", reason: "invalid_review_participant" },
    );
  });

  it("surfaces invalid and unassigned blocker leaves instead of covering parents", () => {
    expectDisposition(
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "in_review",
              assigneeAgentId: agentId,
              assigneeUserId: null,
            },
            disposition: {
              kind: "invalid",
              reason: "in_review_without_action_path",
              suggestedCorrection: "Add an explicit wait path.",
            },
          },
        ],
      }),
      { kind: "invalid", reason: "blocked_by_invalid_issue" },
    );
    expectDisposition(
      state({
        issue: { status: "blocked" },
        blockers: [
          {
            issue: {
              id: "blocker-1",
              status: "todo",
              assigneeAgentId: null,
              assigneeUserId: null,
            },
          },
        ],
      }),
      { kind: "invalid", reason: "blocked_by_unassigned_issue" },
    );
  });
});
