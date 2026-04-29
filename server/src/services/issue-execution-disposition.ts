import type {
  AgentStatus,
  IssueOriginKind,
  IssueStatus,
} from "@paperclipai/shared";
import type {
  IssueExecutionDisposition,
  IssueExecutionInvalidReason,
  IssueExecutionLivePath,
  IssueExecutionWaitingPath,
} from "@paperclipai/shared";

export type IssueExecutionWaitSignalState = "none" | "live" | "stale";
export type IssueExecutionParticipantState = "none" | "valid" | "invalid";
export type IssueExecutionRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";
export type IssueExecutionRunLivenessState =
  | "advanced"
  | "plan_only"
  | "empty_response"
  | "no_progress"
  | "unknown";
export type IssueExecutionNextActionState =
  | "runnable"
  | "manager_review"
  | "approval_required"
  | "unknown"
  | "none";

export interface IssueExecutionDispositionIssueInput {
  id: string;
  status: IssueStatus;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  originKind?: IssueOriginKind | string | null;
}

export interface IssueExecutionDispositionAgentInput {
  id: string;
  status: AgentStatus | string;
}

export interface IssueExecutionPathVector {
  activeRun?: boolean;
  queuedWake?: boolean;
  scheduledRetry?: boolean;
  deferredExecution?: boolean;
}

export interface IssueExecutionWaitVector {
  participant?: IssueExecutionParticipantState;
  pendingInteraction?: IssueExecutionWaitSignalState;
  pendingApproval?: IssueExecutionWaitSignalState;
  pauseHold?: boolean;
  openRecoveryIssue?: boolean;
  openWatchdogIssue?: boolean;
  openProductivityReviewIssue?: boolean;
  productivityReviewNeeded?: boolean;
  externalOwnerAction?: boolean;
}

export interface IssueExecutionRunEvidence {
  latestRunStatus?: IssueExecutionRunStatus | null;
  livenessState?: IssueExecutionRunLivenessState | null;
  nextAction?: IssueExecutionNextActionState | null;
  continuationAttempt?: number | null;
  maxContinuationAttempts?: number | null;
  recoveryAttemptRemaining?: boolean;
}

export interface IssueExecutionBlockerVector {
  issue: Pick<IssueExecutionDispositionIssueInput, "id" | "status" | "assigneeAgentId" | "assigneeUserId">;
  disposition?: IssueExecutionDisposition;
  stateVector?: IssueExecutionStateVector;
}

export interface IssueExecutionGateVector {
  budgetBlocked?: boolean;
}

export interface IssueExecutionStateVector {
  issue: IssueExecutionDispositionIssueInput;
  agent?: IssueExecutionDispositionAgentInput | null;
  execution?: IssueExecutionPathVector;
  waits?: IssueExecutionWaitVector;
  latestRun?: IssueExecutionRunEvidence | null;
  blockers?: IssueExecutionBlockerVector[];
  gates?: IssueExecutionGateVector;
}

const INVOKABLE_AGENT_STATUSES = new Set(["active", "idle", "running", "error"]);
const RECOVERY_ORIGIN_KINDS = new Set(["stranded_issue_recovery", "harness_liveness_escalation"]);

function invalid(
  reason: IssueExecutionInvalidReason,
  suggestedCorrection: string,
): IssueExecutionDisposition {
  return { kind: "invalid", reason, suggestedCorrection };
}

function hasAgentOwner(issue: IssueExecutionDispositionIssueInput) {
  return Boolean(issue.assigneeAgentId);
}

function hasHumanOwner(issue: IssueExecutionDispositionIssueInput) {
  return Boolean(issue.assigneeUserId);
}

function agentIsInvokable(
  issue: IssueExecutionDispositionIssueInput,
  agent: IssueExecutionDispositionAgentInput | null | undefined,
  budgetBlocked: boolean,
) {
  if (!issue.assigneeAgentId || !agent || agent.id !== issue.assigneeAgentId) return false;
  if (budgetBlocked) return false;
  return INVOKABLE_AGENT_STATUSES.has(agent.status);
}

function livePath(execution: IssueExecutionPathVector | undefined): IssueExecutionLivePath | null {
  if (execution?.activeRun) return "active_run";
  if (execution?.queuedWake) return "queued_wake";
  if (execution?.scheduledRetry) return "scheduled_retry";
  if (execution?.deferredExecution) return "deferred_execution";
  return null;
}

function waitingPath(
  issue: IssueExecutionDispositionIssueInput,
  waits: IssueExecutionWaitVector | undefined,
): IssueExecutionWaitingPath | null {
  if (waits?.pauseHold) return "pause_hold";
  if (hasHumanOwner(issue)) return "human_owner";
  if (waits?.participant === "valid") return "participant";
  if (waits?.pendingInteraction === "live") return "interaction";
  if (waits?.pendingApproval === "live") return "approval";
  if (waits?.openRecoveryIssue || waits?.openWatchdogIssue || waits?.openProductivityReviewIssue) {
    return "review_artifact";
  }
  if (waits?.externalOwnerAction) return "external_owner_action";
  return null;
}

function runFailed(run: IssueExecutionRunEvidence | null | undefined) {
  return (
    run?.latestRunStatus === "failed" ||
    run?.latestRunStatus === "timed_out" ||
    run?.latestRunStatus === "cancelled"
  );
}

function hasRunnableContinuation(run: IssueExecutionRunEvidence | null | undefined) {
  const attempt = run?.continuationAttempt ?? 0;
  const maxAttempts = run?.maxContinuationAttempts ?? 2;
  return (
    run?.latestRunStatus === "succeeded" &&
    run.livenessState === "advanced" &&
    run.nextAction === "runnable" &&
    attempt < maxAttempts
  );
}

function hasExhaustedOrAmbiguousContinuation(run: IssueExecutionRunEvidence | null | undefined) {
  if (run?.latestRunStatus !== "succeeded") return false;
  if (run.livenessState !== "advanced") return true;
  if (run.nextAction !== "runnable") return true;
  return (run.continuationAttempt ?? 0) >= (run.maxContinuationAttempts ?? 2);
}

function isRecoveryIssue(issue: IssueExecutionDispositionIssueInput) {
  return Boolean(issue.originKind && RECOVERY_ORIGIN_KINDS.has(issue.originKind));
}

function classifyBlocker(
  blocker: IssueExecutionBlockerVector,
  seen: Set<string>,
): IssueExecutionDisposition {
  if (blocker.disposition) return blocker.disposition;
  if (blocker.stateVector) return classifyIssueExecutionDisposition(blocker.stateVector, seen);
  return classifyIssueExecutionDisposition({ issue: blocker.issue as IssueExecutionDispositionIssueInput }, seen);
}

function blockerInvalidReason(blocker: IssueExecutionBlockerVector): IssueExecutionInvalidReason {
  if (blocker.issue.status === "cancelled") return "blocked_by_cancelled_issue";
  if (!blocker.issue.assigneeAgentId && !blocker.issue.assigneeUserId) return "blocked_by_unassigned_issue";
  return "blocked_by_resting_issue";
}

function classifyBlockedIssue(
  input: IssueExecutionStateVector,
  seen: Set<string>,
): IssueExecutionDisposition {
  const blockers = input.blockers ?? [];
  if (blockers.length > 0) {
    for (const blocker of blockers) {
      if (blocker.issue.status === "cancelled") {
        return invalid(
          "blocked_by_cancelled_issue",
          "Remove or replace the cancelled blocker before treating the dependency chain as covered.",
        );
      }

      const disposition = classifyBlocker(blocker, seen);
      if (disposition.kind === "invalid") {
        return invalid(
          "blocked_by_invalid_issue",
          "Repair the invalid unresolved blocker or create an explicit recovery/escalation path.",
        );
      }
      if (disposition.kind === "resting" || disposition.kind === "terminal") {
        return invalid(
          blockerInvalidReason(blocker),
          "Give the blocker a lawful next action, remove the blocker, or escalate to a human owner.",
        );
      }
    }

    return { kind: "waiting", path: "blocker_chain" };
  }

  const path = waitingPath(input.issue, input.waits);
  if (path) return { kind: "waiting", path };

  return invalid(
    "blocked_without_action_path",
    "Blocked issues require first-class blockers, a live wait primitive, or a structured external owner/action.",
  );
}

export function classifyIssueExecutionDisposition(
  input: IssueExecutionStateVector,
  seen = new Set<string>(),
): IssueExecutionDisposition {
  const { issue } = input;
  const status = issue.status;
  const budgetBlocked = Boolean(input.gates?.budgetBlocked);
  const agentInvokable = agentIsInvokable(issue, input.agent, budgetBlocked);
  const path = livePath(input.execution);
  const wait = waitingPath(issue, input.waits);

  if (status === "done" || status === "cancelled") return { kind: "terminal" };

  if (seen.has(issue.id)) {
    return invalid(
      "blocked_by_invalid_issue",
      "Break the recursive blocker chain or create an explicit recovery issue.",
    );
  }
  seen.add(issue.id);

  if (hasAgentOwner(issue) && hasHumanOwner(issue)) {
    return invalid("dual_assignee", "Keep exactly one issue assignee: agent or human user, not both.");
  }

  if (status === "backlog") return { kind: "resting" };
  if (wait) return { kind: "waiting", path: wait };
  if (input.waits?.participant === "invalid") {
    return invalid(
      "invalid_review_participant",
      "Set a typed execution participant with a valid agentId/userId or replace it with another explicit wait path.",
    );
  }
  if (status === "blocked") return classifyBlockedIssue(input, seen);
  if (hasHumanOwner(issue)) return { kind: "waiting", path: "human_owner" };
  if (!hasAgentOwner(issue)) return { kind: "resting" };
  if (path) return { kind: "live", path };

  if (!agentInvokable) {
    return { kind: "human_escalation_required", owner: budgetBlocked ? "board" : "manager" };
  }

  if (status === "todo") {
    if (runFailed(input.latestRun) && input.latestRun?.recoveryAttemptRemaining !== false) {
      return { kind: "recoverable_by_control_plane", recovery: "dispatch" };
    }
    if (runFailed(input.latestRun)) {
      return { kind: "human_escalation_required", owner: "manager" };
    }
    if (input.waits?.productivityReviewNeeded) {
      return { kind: "human_escalation_required", owner: "manager" };
    }
    return { kind: "dispatchable", wakeTarget: issue.assigneeAgentId! };
  }

  if (status === "in_progress") {
    if (isRecoveryIssue(issue) && runFailed(input.latestRun)) {
      return { kind: "human_escalation_required", owner: "recovery_owner" };
    }
    if (runFailed(input.latestRun) && input.latestRun?.recoveryAttemptRemaining !== false) {
      return { kind: "recoverable_by_control_plane", recovery: "continuation" };
    }
    if (runFailed(input.latestRun)) {
      return { kind: "human_escalation_required", owner: "manager" };
    }
    if (input.waits?.productivityReviewNeeded) {
      return { kind: "human_escalation_required", owner: "manager" };
    }
    if (hasRunnableContinuation(input.latestRun)) {
      return {
        kind: "agent_continuable",
        continuationAttempt: input.latestRun?.continuationAttempt ?? 0,
        maxAttempts: input.latestRun?.maxContinuationAttempts ?? 2,
      };
    }
    if (hasExhaustedOrAmbiguousContinuation(input.latestRun)) {
      return { kind: "human_escalation_required", owner: "manager" };
    }
    return { kind: "dispatchable", wakeTarget: issue.assigneeAgentId! };
  }

  if (status === "in_review") {
    return invalid(
      "in_review_without_action_path",
      "Agent-owned review requires a typed participant, pending interaction, approval, active/queued execution path, human owner, or explicit recovery issue.",
    );
  }

  return { kind: "human_escalation_required", owner: "manager" };
}
