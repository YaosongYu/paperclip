const EXPLICIT_WAITING_PATH_FRESHNESS_MS = 24 * 60 * 60 * 1000;

type MaybeDate = Date | string | null | undefined;

export type ExplicitWaitingIssueInput = {
  companyId: string;
  id: string;
  assigneeUserId?: string | null;
  executionState?: Record<string, unknown> | null;
};

export type ExplicitWaitingInteractionInput = {
  companyId: string;
  issueId: string;
  status?: string | null;
  createdByUserId?: string | null;
  createdAt?: MaybeDate;
};

export type ExplicitWaitingApprovalInput = {
  companyId: string;
  issueId: string;
  status?: string | null;
  requestedByUserId?: string | null;
  linkedByUserId?: string | null;
  createdAt?: MaybeDate;
  updatedAt?: MaybeDate;
  linkedAt?: MaybeDate;
};

function parseDate(value: MaybeDate) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestDate(...values: MaybeDate[]) {
  return values
    .map(parseDate)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function currentParticipantIsUser(executionState: Record<string, unknown> | null | undefined) {
  const participant = executionState?.currentParticipant;
  if (!participant || typeof participant !== "object") return false;
  const value = participant as Record<string, unknown>;
  return value.type === "user" && typeof value.userId === "string" && value.userId.trim().length > 0;
}

function issueHasHumanOwner(issue: ExplicitWaitingIssueInput) {
  return Boolean(issue.assigneeUserId) || currentParticipantIsUser(issue.executionState);
}

function isFreshWaitingPath(createdAt: MaybeDate, now: Date) {
  const created = parseDate(createdAt);
  if (!created) return false;
  return now.getTime() - created.getTime() <= EXPLICIT_WAITING_PATH_FRESHNESS_MS;
}

export function isLiveExplicitInteractionWaitingPath(
  issue: ExplicitWaitingIssueInput,
  interaction: ExplicitWaitingInteractionInput,
  now = new Date(),
) {
  if (interaction.companyId !== issue.companyId || interaction.issueId !== issue.id) return false;
  if (interaction.status && interaction.status !== "pending") return false;
  if (issueHasHumanOwner(issue)) return true;
  if (interaction.createdByUserId) return true;
  return isFreshWaitingPath(interaction.createdAt, now);
}

export function isLiveExplicitApprovalWaitingPath(
  issue: ExplicitWaitingIssueInput,
  approval: ExplicitWaitingApprovalInput,
  now = new Date(),
) {
  if (approval.companyId !== issue.companyId || approval.issueId !== issue.id) return false;
  if (approval.status && approval.status !== "pending" && approval.status !== "revision_requested") return false;
  if (issueHasHumanOwner(issue)) return true;
  if (approval.requestedByUserId || approval.linkedByUserId) return true;
  return isFreshWaitingPath(latestDate(approval.updatedAt, approval.linkedAt, approval.createdAt), now);
}

