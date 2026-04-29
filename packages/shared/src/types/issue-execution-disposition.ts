export type IssueExecutionDispositionKind =
  | "terminal"
  | "resting"
  | "dispatchable"
  | "live"
  | "waiting"
  | "recoverable_by_control_plane"
  | "agent_continuable"
  | "human_escalation_required"
  | "invalid";

export type IssueExecutionLivePath =
  | "active_run"
  | "queued_wake"
  | "scheduled_retry"
  | "deferred_execution";

export type IssueExecutionWaitingPath =
  | "participant"
  | "interaction"
  | "approval"
  | "human_owner"
  | "blocker_chain"
  | "pause_hold"
  | "review_artifact"
  | "external_owner_action";

export type IssueExecutionRecoveryKind = "dispatch" | "continuation" | "repair_wait";

export type IssueExecutionHumanEscalationOwner =
  | "board"
  | "manager"
  | "recovery_owner"
  | "external";

export type IssueExecutionInvalidReason =
  | "dual_assignee"
  | "invalid_review_participant"
  | "in_review_without_action_path"
  | "blocked_by_invalid_issue"
  | "blocked_by_cancelled_issue"
  | "blocked_by_unassigned_issue"
  | "blocked_by_resting_issue"
  | "blocked_without_action_path";

export type IssueExecutionDisposition =
  | { kind: "terminal" }
  | { kind: "resting" }
  | { kind: "dispatchable"; wakeTarget: string }
  | { kind: "live"; path: IssueExecutionLivePath }
  | { kind: "waiting"; path: IssueExecutionWaitingPath }
  | { kind: "recoverable_by_control_plane"; recovery: IssueExecutionRecoveryKind }
  | { kind: "agent_continuable"; continuationAttempt: number; maxAttempts: number }
  | { kind: "human_escalation_required"; owner: IssueExecutionHumanEscalationOwner }
  | {
      kind: "invalid";
      reason: IssueExecutionInvalidReason;
      suggestedCorrection: string;
    };
