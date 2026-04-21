import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isUuidLike,
  MEMORY_EXTRACTION_JOB_OPERATION_TYPES,
  MEMORY_EXTRACTION_JOB_STATUSES,
  type Agent,
  type HeartbeatRun,
  type Issue,
  type MemoryExtractionJobDetail,
  type MemoryExtractionJobEffectiveState,
  type MemoryExtractionJobListItem,
  type MemoryExtractionJobOperationType,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import { memoryJobsApi } from "@/api/memoryJobs";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToastActions } from "@/context/ToastContext";
import { Link, useSearchParams } from "@/lib/router";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Database, RefreshCcw, Search } from "lucide-react";

const JOB_LIST_LIMIT = 100;
const BINDING_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

type JobStateFilter = "attention" | "all" | MemoryExtractionJobEffectiveState;

type FilterDraft = {
  state: JobStateFilter;
  bindingKey: string;
  operationType: "all" | MemoryExtractionJobOperationType;
  agentId: string;
  issueRef: string;
  runId: string;
};

type AppliedFilters = {
  state: JobStateFilter;
  bindingKey?: string;
  operationType?: MemoryExtractionJobOperationType;
  agentId?: string;
  issueId?: string;
  issueLabel?: string;
  runId?: string;
};

const defaultDraftFilters: FilterDraft = {
  state: "attention",
  bindingKey: "",
  operationType: "all",
  agentId: "all",
  issueRef: "",
  runId: "",
};

const defaultAppliedFilters: AppliedFilters = {
  state: "attention",
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCost(cents: number | null | undefined) {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function shortId(value: string | null | undefined) {
  if (!value) return null;
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function summarizeJob(job: Pick<MemoryExtractionJobListItem | MemoryExtractionJobDetail, "error" | "resultSummary">) {
  if (job.error) return job.error;
  if (job.resultSummary) return job.resultSummary;
  return "—";
}

function mergeJobLists(...jobs: MemoryExtractionJobListItem[][]) {
  return jobs
    .flat()
    .sort((left, right) => {
      return new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
    });
}

function stateBadgeTone(value: MemoryExtractionJobEffectiveState) {
  switch (value) {
    case "failed":
      return "destructive" as const;
    case "stuck":
      return "secondary" as const;
    case "succeeded":
      return "secondary" as const;
    case "queued":
    case "cancelled":
      return "outline" as const;
    default:
      return "default" as const;
  }
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function MemoryJobs() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(defaultDraftFilters);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(defaultAppliedFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Company Settings", href: "/company/settings" },
      { label: "Memory Jobs" },
    ]);
  }, [setBreadcrumbs]);

  const { data: agents } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "__none__"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents ?? []) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const commonFilters = useMemo(
    () => ({
      bindingKey: appliedFilters.bindingKey,
      operationType: appliedFilters.operationType,
      agentId: appliedFilters.agentId,
      issueId: appliedFilters.issueId,
      runId: appliedFilters.runId,
      limit: JOB_LIST_LIMIT,
    }),
    [
      appliedFilters.agentId,
      appliedFilters.bindingKey,
      appliedFilters.issueId,
      appliedFilters.operationType,
      appliedFilters.runId,
    ],
  );

  const singleStateFilter: MemoryExtractionJobEffectiveState | undefined =
    appliedFilters.state === "attention" || appliedFilters.state === "all"
      ? undefined
      : appliedFilters.state;

  const attentionFailedQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.memoryJobs.list(selectedCompanyId, { ...commonFilters, effectiveState: "failed" })
      : ["memory-jobs", "__none__", "failed"],
    queryFn: () => memoryJobsApi.list(selectedCompanyId!, { ...commonFilters, effectiveState: "failed" }),
    enabled: !!selectedCompanyId && appliedFilters.state === "attention",
  });

  const attentionStuckQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.memoryJobs.list(selectedCompanyId, { ...commonFilters, effectiveState: "stuck" })
      : ["memory-jobs", "__none__", "stuck"],
    queryFn: () => memoryJobsApi.list(selectedCompanyId!, { ...commonFilters, effectiveState: "stuck" }),
    enabled: !!selectedCompanyId && appliedFilters.state === "attention",
  });

  const listQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.memoryJobs.list(selectedCompanyId, {
          ...commonFilters,
          effectiveState: singleStateFilter,
        })
      : ["memory-jobs", "__none__", "list"],
    queryFn: () =>
      memoryJobsApi.list(selectedCompanyId!, {
        ...commonFilters,
        effectiveState: singleStateFilter,
      }),
    enabled: !!selectedCompanyId && appliedFilters.state !== "attention",
  });

  const jobs = useMemo(() => {
    if (appliedFilters.state === "attention") {
      return mergeJobLists(attentionFailedQuery.data?.jobs ?? [], attentionStuckQuery.data?.jobs ?? []);
    }
    return listQuery.data?.jobs ?? [];
  }, [
    appliedFilters.state,
    attentionFailedQuery.data?.jobs,
    attentionStuckQuery.data?.jobs,
    listQuery.data?.jobs,
  ]);

  const listError = (appliedFilters.state === "attention"
    ? attentionFailedQuery.error ?? attentionStuckQuery.error
    : listQuery.error) as Error | null;
  const listLoading = appliedFilters.state === "attention"
    ? attentionFailedQuery.isLoading || attentionStuckQuery.isLoading
    : listQuery.isLoading;

  const explicitSelectedJobId = searchParams.get("jobId");
  const selectedJobId = explicitSelectedJobId ?? jobs[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: selectedCompanyId && selectedJobId
      ? queryKeys.memoryJobs.detail(selectedCompanyId, selectedJobId)
      : ["memory-jobs", "detail", "__none__"],
    queryFn: () => memoryJobsApi.get(selectedCompanyId!, selectedJobId!),
    enabled: !!selectedCompanyId && !!selectedJobId,
  });

  const selectedJob = detailQuery.data?.job ?? null;

  const sourceIssueQuery = useQuery({
    queryKey: selectedJob?.sourceIssueId ? queryKeys.issues.detail(selectedJob.sourceIssueId) : ["issues", "detail", "__none__"],
    queryFn: () => issuesApi.get(selectedJob!.sourceIssueId!),
    enabled: !!selectedJob?.sourceIssueId,
    retry: false,
  });

  const sourceRunQuery = useQuery({
    queryKey: selectedJob?.sourceHeartbeatRunId
      ? queryKeys.runDetail(selectedJob.sourceHeartbeatRunId)
      : ["heartbeat-run", "__none__"],
    queryFn: () => heartbeatsApi.get(selectedJob!.sourceHeartbeatRunId!),
    enabled: !!selectedJob?.sourceHeartbeatRunId,
    retry: false,
  });

  const rerunMutation = useMutation({
    mutationFn: (jobId: string) => memoryJobsApi.rerun(selectedCompanyId!, jobId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.memoryJobs.detail(selectedCompanyId!, result.job.id), result);
      queryClient.invalidateQueries({ queryKey: queryKeys.memoryJobs.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.memoryJobs.detail(selectedCompanyId!, result.job.id) });

      const shouldSwitchToAll = appliedFilters.state !== "all";
      if (shouldSwitchToAll) {
        setAppliedFilters((current) => ({ ...current, state: "all" }));
        setDraftFilters((current) => ({ ...current, state: "all" }));
      }

      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("jobId", result.job.id);
        return next;
      });

      pushToast({
        title: "Memory job rerun queued",
        body: shouldSwitchToAll ? "Switched the list to All so the new queued attempt stays visible." : undefined,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Memory job rerun failed",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  async function applyFilters() {
    setIsApplyingFilters(true);
    setFilterError(null);

    try {
      const nextBindingKey = draftFilters.bindingKey.trim();
      if (nextBindingKey && !BINDING_KEY_PATTERN.test(nextBindingKey)) {
        setFilterError("Binding key must use lowercase letters, numbers, _ or -.");
        return;
      }

      const nextRunId = draftFilters.runId.trim();
      if (nextRunId && !isUuidLike(nextRunId)) {
        setFilterError("Run filter expects a heartbeat run UUID.");
        return;
      }

      let issueId: string | undefined;
      let issueLabel: string | undefined;
      const nextIssueRef = draftFilters.issueRef.trim();
      if (nextIssueRef) {
        if (isUuidLike(nextIssueRef)) {
          issueId = nextIssueRef;
          issueLabel = nextIssueRef;
        } else {
          const issue = await issuesApi.get(nextIssueRef);
          if (issue.companyId !== selectedCompanyId) {
            setFilterError("Issue filter resolved outside the selected company.");
            return;
          }
          issueId = issue.id;
          issueLabel = issue.identifier ?? issue.id;
        }
      }

      setAppliedFilters({
        state: draftFilters.state,
        bindingKey: nextBindingKey || undefined,
        operationType: draftFilters.operationType === "all" ? undefined : draftFilters.operationType,
        agentId: draftFilters.agentId === "all" ? undefined : draftFilters.agentId,
        issueId,
        issueLabel,
        runId: nextRunId || undefined,
      });

      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("jobId");
        return next;
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setFilterError("Issue filter did not match a visible issue.");
        return;
      }
      setFilterError(error instanceof Error ? error.message : "Failed to apply filters.");
    } finally {
      setIsApplyingFilters(false);
    }
  }

  function resetFilters() {
    setFilterError(null);
    setDraftFilters(defaultDraftFilters);
    setAppliedFilters(defaultAppliedFilters);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("jobId");
      return next;
    });
  }

  const selectedIssue = sourceIssueQuery.data as Issue | undefined;
  const selectedRun = sourceRunQuery.data as HeartbeatRun | undefined;

  if (!selectedCompanyId) {
    return <EmptyState icon={Database} message="Select a company to view memory jobs." />;
  }

  if (listLoading && jobs.length === 0) {
    return <PageSkeleton variant="detail" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Memory Jobs</CardTitle>
          <CardDescription>
            Inspect failed and stuck memory extraction work, trace provenance, and rerun eligible attempts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">State</div>
              <Select
                value={draftFilters.state}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, state: value as JobStateFilter }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All states" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attention">Failed + stuck</SelectItem>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="stuck">Stuck</SelectItem>
                  {MEMORY_EXTRACTION_JOB_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operation</div>
              <Select
                value={draftFilters.operationType}
                onValueChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    operationType: value as FilterDraft["operationType"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All operations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operations</SelectItem>
                  {MEMORY_EXTRACTION_JOB_OPERATION_TYPES.map((operationType) => (
                    <SelectItem key={operationType} value={operationType}>
                      {formatLabel(operationType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agent</div>
              <Select
                value={draftFilters.agentId}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, agentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {(agents ?? []).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Binding key</div>
              <Input
                value={draftFilters.bindingKey}
                onChange={(event) => setDraftFilters((current) => ({ ...current, bindingKey: event.target.value }))}
                placeholder="primary"
              />
            </div>

            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Issue</div>
              <Input
                value={draftFilters.issueRef}
                onChange={(event) => setDraftFilters((current) => ({ ...current, issueRef: event.target.value }))}
                placeholder="PAP-1708 or UUID"
              />
            </div>

            <div className="space-y-1 xl:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run</div>
              <Input
                value={draftFilters.runId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, runId: event.target.value }))}
                placeholder="Heartbeat run UUID"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {appliedFilters.state === "attention"
                  ? `Showing latest ${JOB_LIST_LIMIT} per state`
                  : `Showing latest ${JOB_LIST_LIMIT}`}
              </Badge>
              <Badge variant="outline">{jobs.length} visible</Badge>
              {appliedFilters.issueLabel ? <Badge variant="outline">Issue {appliedFilters.issueLabel}</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetFilters}>Reset</Button>
              <Button onClick={applyFilters} disabled={isApplyingFilters}>
                <Search className="h-4 w-4" />
                Apply filters
              </Button>
            </div>
          </div>

          {filterError ? <p className="text-sm text-destructive">{filterError}</p> : null}
          {listError ? <p className="text-sm text-destructive">{listError.message}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base">Job List</CardTitle>
            <CardDescription>
              {appliedFilters.state === "attention"
                ? "Failed and stuck jobs across the selected filters."
                : "Newest jobs matching the selected filters."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {jobs.length === 0 ? (
              <EmptyState icon={Database} message="No memory jobs match these filters." />
            ) : (
              <div className="overflow-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Job</th>
                      <th className="px-4 py-3 text-left font-medium">State</th>
                      <th className="px-4 py-3 text-left font-medium">Binding</th>
                      <th className="px-4 py-3 text-left font-medium">Issue</th>
                      <th className="px-4 py-3 text-left font-medium">Run</th>
                      <th className="px-4 py-3 text-left font-medium">Agent</th>
                      <th className="px-4 py-3 text-left font-medium">Submitted</th>
                      <th className="px-4 py-3 text-left font-medium">Cost</th>
                      <th className="px-4 py-3 text-left font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const isSelected = selectedJobId === job.id;
                      return (
                        <tr key={job.id} className={cn("border-b align-top", isSelected && "bg-accent/30")}> 
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="space-y-1 text-left"
                              onClick={() => {
                                setSearchParams((current) => {
                                  const next = new URLSearchParams(current);
                                  next.set("jobId", job.id);
                                  return next;
                                });
                              }}
                            >
                              <div className="font-medium text-foreground">{formatLabel(job.operationType)}</div>
                              <div className="text-xs text-muted-foreground">{shortId(job.id)}</div>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={stateBadgeTone(job.effectiveState)}>{formatLabel(job.effectiveState)}</Badge>
                              <Badge variant="outline">Attempt {job.attemptNumber}</Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{job.bindingKey}</td>
                          <td className="px-4 py-3">
                            {job.sourceIssueId ? (
                              <Link className="text-primary hover:underline" to={`/issues/${job.sourceIssueId}`}>
                                {shortId(job.sourceIssueId)}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {job.sourceHeartbeatRunId && job.sourceAgentId ? (
                              <Link className="text-primary hover:underline" to={`/agents/${job.sourceAgentId}/runs/${job.sourceHeartbeatRunId}`}>
                                {shortId(job.sourceHeartbeatRunId)}
                              </Link>
                            ) : job.sourceHeartbeatRunId ? (
                              <span className="text-muted-foreground">{shortId(job.sourceHeartbeatRunId)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {job.sourceAgentId ? (
                              <Link className="text-primary hover:underline" to={`/agents/${job.sourceAgentId}`}>
                                {agentById.get(job.sourceAgentId)?.name ?? shortId(job.sourceAgentId)}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatTimestamp(job.submittedAt)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatCost(job.costCents)}</td>
                          <td className="max-w-xs px-4 py-3">
                            <div className={cn("line-clamp-3 text-sm", job.error ? "text-destructive" : "text-muted-foreground")}>
                              {summarizeJob(job)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Job Detail
              {selectedJob ? <Badge variant="outline">{shortId(selectedJob.id)}</Badge> : null}
            </CardTitle>
            <CardDescription>
              Provenance, lifecycle, usage, and rerun controls for the selected memory job.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedJobId && detailQuery.isLoading ? (
              <PageSkeleton variant="detail" />
            ) : detailQuery.error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {(detailQuery.error as Error).message}
              </div>
            ) : selectedJob ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stateBadgeTone(selectedJob.effectiveState)}>
                    {formatLabel(selectedJob.effectiveState)}
                  </Badge>
                  <Badge variant="outline">{formatLabel(selectedJob.status)}</Badge>
                  <Badge variant="outline">Attempt {selectedJob.attemptNumber}</Badge>
                  {selectedJob.retryCount > 0 ? (
                    <Badge variant="outline">{selectedJob.retryCount} prior retries</Badge>
                  ) : null}
                </div>

                {selectedJob.error ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Failure surfaced to operators
                    </div>
                    <div>{selectedJob.error}</div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <DetailValue label="Operation" value={formatLabel(selectedJob.operationType)} />
                  <DetailValue label="Binding key" value={selectedJob.bindingKey} />
                  <DetailValue label="Hook kind" value={selectedJob.hookKind ? formatLabel(selectedJob.hookKind) : "—"} />
                  <DetailValue label="Source kind" value={formatLabel(selectedJob.sourceKind)} />
                  <DetailValue label="Dispatcher" value={formatLabel(selectedJob.dispatcherKind)} />
                  <DetailValue label="Attribution" value={formatLabel(selectedJob.attributionMode)} />
                  <DetailValue label="Submitted" value={formatTimestamp(selectedJob.submittedAt)} />
                  <DetailValue label="Started" value={formatTimestamp(selectedJob.startedAt)} />
                  <DetailValue label="Finished" value={formatTimestamp(selectedJob.finishedAt)} />
                  <DetailValue label="Lease expires" value={formatTimestamp(selectedJob.leaseExpiresAt)} />
                  <DetailValue label="Cost" value={formatCost(selectedJob.costCents)} />
                  <DetailValue label="Provider job id" value={selectedJob.providerJobId ?? "—"} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provenance</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailValue
                      label="Issue"
                      value={selectedJob.sourceIssueId ? (
                        <Link className="text-primary hover:underline" to={`/issues/${selectedJob.sourceIssueId}`}>
                          {selectedIssue?.identifier ?? shortId(selectedJob.sourceIssueId)}
                        </Link>
                      ) : "—"}
                    />
                    <DetailValue
                      label="Run"
                      value={selectedJob.sourceHeartbeatRunId && selectedJob.sourceAgentId ? (
                        <Link
                          className="text-primary hover:underline"
                          to={`/agents/${selectedJob.sourceAgentId}/runs/${selectedJob.sourceHeartbeatRunId}`}
                        >
                          {selectedRun?.id ? shortId(selectedRun.id) : shortId(selectedJob.sourceHeartbeatRunId)}
                        </Link>
                      ) : selectedJob.sourceHeartbeatRunId ? shortId(selectedJob.sourceHeartbeatRunId) : "—"}
                    />
                    <DetailValue
                      label="Agent"
                      value={selectedJob.sourceAgentId ? (
                        <Link className="text-primary hover:underline" to={`/agents/${selectedJob.sourceAgentId}`}>
                          {agentById.get(selectedJob.sourceAgentId)?.name ?? shortId(selectedJob.sourceAgentId)}
                        </Link>
                      ) : "—"}
                    />
                    <DetailValue
                      label="Retry root"
                      value={selectedJob.retryOfJobId ? shortId(selectedJob.retryOfJobId) : "Original attempt"}
                    />
                    <DetailValue
                      label="Project"
                      value={selectedJob.sourceProjectId ? (
                        <Link className="text-primary hover:underline" to={`/projects/${selectedJob.sourceProjectId}`}>
                          {shortId(selectedJob.sourceProjectId)}
                        </Link>
                      ) : "—"}
                    />
                    <DetailValue
                      label="Goal"
                      value={selectedJob.sourceGoalId ? (
                        <Link className="text-primary hover:underline" to={`/goals/${selectedJob.sourceGoalId}`}>
                          {shortId(selectedJob.sourceGoalId)}
                        </Link>
                      ) : "—"}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</div>
                  <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    {summarizeJob(selectedJob)}
                  </div>
                  {selectedJob.errorCode ? (
                    <div className="text-sm text-muted-foreground">Error code: <span className="font-medium text-foreground">{selectedJob.errorCode}</span></div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Usage</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailValue label="Provider" value={selectedJob.usageJson?.provider ?? "—"} />
                    <DetailValue label="Model" value={selectedJob.usageJson?.model ?? "—"} />
                    <DetailValue label="Biller" value={selectedJob.usageJson?.biller ?? "—"} />
                    <DetailValue label="Billing type" value={selectedJob.usageJson?.billingType ?? "—"} />
                    <DetailValue label="Input tokens" value={selectedJob.usageJson?.inputTokens ?? "—"} />
                    <DetailValue label="Cached input" value={selectedJob.usageJson?.cachedInputTokens ?? "—"} />
                    <DetailValue label="Output tokens" value={selectedJob.usageJson?.outputTokens ?? "—"} />
                    <DetailValue label="Embedding tokens" value={selectedJob.usageJson?.embeddingTokens ?? "—"} />
                    <DetailValue label="Latency" value={selectedJob.usageJson?.latencyMs ? `${selectedJob.usageJson.latencyMs} ms` : "—"} />
                    <DetailValue label="Usage cost" value={typeof selectedJob.usageJson?.costCents === "number" ? formatCost(selectedJob.usageJson.costCents) : "—"} />
                  </div>
                  <JsonBlock value={selectedJob.usageJson?.details ?? null} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source ref</div>
                  <JsonBlock value={selectedJob.sourceRefJson} />
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result payload</div>
                  <JsonBlock value={selectedJob.resultJson} />
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    onClick={() => rerunMutation.mutate(selectedJob.id)}
                    disabled={!selectedJob.rerunEligible || rerunMutation.isPending}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {rerunMutation.isPending ? "Queuing rerun..." : "Rerun job"}
                  </Button>
                  {!selectedJob.rerunEligible ? (
                    <span className="text-sm text-muted-foreground">
                      Rerun is available after the job reaches a terminal state.
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState icon={Database} message="Select a memory job to inspect details." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
