# Run A — Notes

Accumulating log of decisions, DS deviations, operating-principles citations, and surfaced findings across the Run A phases. Phase 4 will consolidate; phases 2–3 append as they go.

---

## Phase 2 fix — activity-state bug and budget window (commit `389f8105`)

### Decisions

- **Activity-state is derived, not read.** The hero activity pill resolves state via a derived `activityStatus` that prefers agent-level terminal states (paused, pending_approval, terminated) first, then looks at the `runs` array to detect running/queued heartbeats, and only falls through to raw `agent.status` for other cases. This guarantees the pill agrees with the Live Run card — both read the same source of truth for "is the agent running right now."
  - *Lens — Mental Models:* users expect the header indicator and the live card to tell the same story; any disagreement is a trust-break.
  - *Lens — Postel's Law:* tolerate imperfect backend signals (stale `agent.status` cache) by deriving from a signal that's always fresh.

### DS deviations

None introduced in this phase. Only used tokens + raw-palette classes that already existed in the dashboard region.

### Surfaced findings (not fixed — flagged for later)

- **Cache-key mismatch for agent.status live-event invalidation** (`ui/src/context/LiveUpdatesProvider.tsx:816` vs `ui/src/pages/AgentDetail.tsx:655`). The detail query keys on the URL-ref (`"conversation-tester"`) plus company-id; the live-event invalidation passes the UUID. React Query's prefix match fails. Derivation sidesteps the symptom; the underlying cache-coherence issue remains. Out of scope for Run A — flagging for a follow-up cleanup.

---

## Phase 3a — Hero module redesign

### Decisions

- **50/50 hero split, not 55/45.** Smoke test feedback: right zone felt cramped at 55/45. Switched to `grid-cols-2`. Both zones now have matched visual weight; right zone has breathing room for the budget card and recent-runs strip without eating vertical space.
  - *Lens — Common Region (Gestalt):* equal widths reinforce "now" vs. "how are we doing" as parallel questions, not subordinate ones. A 55/45 treatment whispered "the left is more important" when in fact both zones carry Section-1-critical signals.

- **Cyan relocated, not preserved at card level.** The Live Run card no longer renders `border-cyan-500/30` + glow shadow. The activity-state pill carries the liveness signal externally; the internal `StatusIcon` (cyan spinning `Loader2` when running) carries it locally. This eliminates the three-way cyan duplication that existed in Phase 2 (pill + card border + internal spinner).
  - *Lens — Von Restorff:* isolation works only when the isolated signal is alone. The pill is now the single chromatic "alive" signal at the top of the hero. The internal spinner is a secondary local signal, small enough not to compete.
  - *Lens — Information Scent:* the pill's position (top-left, where the eye lands first per F-pattern) is the right place for the liveness signal; burying it in a card border is noise, not signal.

- **LatestRunCard header row removed.** The previous "Live Run / Latest Run" heading plus separate "View details →" link were redundant with the activity pill above and the `StatusBadge` inside the card. The card is now a single `Link` — click anywhere navigates to run detail. `aria-label` carries the context for screen readers.
  - *Lens — Fitts's Law:* the whole card as a click target is larger and faster than an isolated text link.
  - *Lens — Recognition over Recall:* the `StatusBadge` inside the card tells the user what kind of card it is without requiring a separate heading.

- **Idle-state "Next up" hint.** When the activity status is `idle` or `active` (i.e., the agent is waiting, not running), the left zone renders a small forward-looking line below the Latest Run card: either `Next up · <task-id> <title> →` (linking to the top in-flight task) or `No pending work` (when there are zero in-flight tasks). This answers "what's supposed to happen next?" for the monitoring user, which the concept §1 flagged as a missing signal.
  - *Lens — Goal-Gradient + Zeigarnik:* an idle agent with pending work should surface that work cheaply; users resolve faster when they see the next step.
  - *Lens — Serial Position:* primary item (`inFlightTasks[0]`, highest priority by existing sort) earns the "Next up" slot; the full list is one scroll away.
  - *Data scope:* the forward-looking signal is derived from `inFlightTasks` (already computed in `AgentOverview`). A richer signal ("Next scheduled run in 12m") would require fetching routines, which is out of scope for this dashboard.

- **Recent-runs strip uses icons, not dots.** The seven recent runs are now rendered as colored lucide icons from `runStatusIcons` (`CheckCircle2`, `XCircle`, `Loader2`, `Clock`, etc.) at `h-3.5 w-3.5`, not colored dots. Each icon is a `<Link>` to the run detail, with `aria-label` and `title` carrying the status + relative time.
  - *Lens — WCAG POUR (color-independence):* icons are shape-distinguished, so colorblind users can parse outcomes without relying on color. Hover/focus tooltip + aria-label provide the full context.
  - *Implementation note:* the Phase 2 `tone.color.replace(/text-/g, "bg-")` hack is gone. LucideIcons use `currentColor`, so the parent link's `tone.color` class propagates cleanly.

- **Activity-pill text color.** Text is `text-foreground` by default, overridden to `text-cyan-600 dark:text-cyan-400` when running and `text-red-600 dark:text-red-400` on error. These specific classes are already present in the dashboard region (`runStatusIcons` at `AgentDetail.tsx:104–111`), so no new raw-palette drift. Paused/pending_approval/terminated use the default foreground text — the colored dot carries the severity.

### DS deviations — "pass with explicit justification"

None of these are DS violations; they are deliberate choices that may look like deviations on cursory review.

- **`rounded-full` on progress-bar track and activity-dot.** Sharp-corners default (`rounded-none`) applies to surfaces; a progress-bar fill and a 2px status dot are not surfaces — they're glyphs. `rounded-full` is the conventional shape for both and matches `BudgetPolicyCard`'s progress bar and the existing `agentStatusDot` usage elsewhere. Not flagged as rounded-corner drift.
- **Progress bar colors remain `bg-red-400 / bg-amber-300 / bg-emerald-300`.** These are raw-palette classes; the concept §3 suggested `--signal-success` for OK state. Decision: match `BudgetPolicyCard` exactly so the dashboard progress bar and the Budget tab card read as one coherent family. Switching to `--signal-success` locally would split the budget visual vocabulary. The rubric Section 5 "no new tokens" bans proposing tokens mid-experiment; using an existing-but-suboptimal pattern beats forking.
- **`bg-cyan-400` pulse on the activity-state dot** comes from `agentStatusDot["running"]` — unchanged from Phase 0 baseline, used consistently across the app (Agents list, Design Guide showcase).

### Surfaced findings

- **`agentStatusDot["idle"]` and `agentStatusDot["paused"]` are both `bg-yellow-400`.** Distinct states, identical dot color — this is an existing DS ambiguity, not something Phase 3a introduced. Users who check the pill can still read the label text ("Idle" vs "Paused"), but the dot alone is not state-distinguishing between these two. Flagging for a future `status-colors.ts` review; modifying the map is out of scope per the rubric.
- **`active` label renders as "Active" with green dot.** This is the pre-first-heartbeat state. The label is informative but uncommon; most users see `running` / `idle` / `paused`. No change needed.
- **Idle-hint visibility overlaps with In-flight tasks list.** The "Next up · top-task →" line in the hero points to the same top task that appears at the top of the in-flight list below. That's intentional — the hint is a *tip* for monitoring users who don't need to scroll, the list below is the full surface. `Progressive Disclosure` in action; not redundancy.
- **Zero-runs state** renders a plain "No runs yet" card in the left zone + the recent-runs strip collapses to "No runs yet." Both reads together communicate "this agent has no history at all" — fine, but two copies of the same empty-state message. Could consolidate in a future pass; not blocking.

### Tensions / open questions for the Phase 3a checkpoint

1. **Is the LatestRunCard without a heading clear enough?** Removing the "Live Run"/"Latest Run" heading flattens hierarchy but removes a piece of context. If the smoke test finds it ambiguous, we can restore a minimal inline label without reintroducing the pulse dot or separate link.
2. **Budget card zero-state.** At 0% utilization the filled div has `width: 0%`, so the track reads as empty. The "0%" label and "$0.00 of $N.NN" text still communicate the state in copy. No minimum-fill treatment was added — that would fake data. Flagging in case the visual impression of "empty track" reads as broken to the smoke test.
3. **Activity-pill presence.** Current treatment is minimal (dot + text, no pill container). The concept called it a "pill" but meant "status indicator" semantically. If you want more visual presence (padded container, subtle background), say so and I'll iterate. `Aesthetic-Usability Effect` says minimal is probably right here — decoration without function adds noise.

---

## Phase 3a polish — 50/25/25 layout + shadcn tooltips

### Decisions

- **Hero is three zones, not two.** 50/50 still felt crowded in the right column because budget card + recent-runs strip were stacked in the same 50%-wide zone. Changed to `lg:grid-cols-[2fr_1fr_1fr]`: left stays at 50% for the current-work surface, middle 25% is budget alone, right 25% is recent-runs alone. Each peer gets horizontal breathing room; the stacked-pair visual weight is gone.
  - *Lens — Common Region (Gestalt):* budget and recent-runs are independent signals that answer different questions ("how are we on spend?" vs. "how did recent runs go?"). Treating them as peers reinforces that independence.
  - *Lens — Proximity:* putting them in separate zones rather than stacked in one zone visually separates concerns.
  - *Budget readability at 25%:* at a 1440px viewport with the standard sidebar, content width lands around 1100–1150px; three zones at 2fr/1fr/1fr give the middle/right zones ~275–290px each. The budget card's densest line — `$amount of $limit` + `utilizationPercent%` — fits comfortably with `justify-between` and `gap-2`; the "remaining · resets in N days" line at text-xs stays within ~250px content width. Tested mentally against worst-case values (`$10,000.00 of $100,000.00` + `100%`) — still fits. No fallback to 50/50 was needed.
  - *Narrow-viewport caveat:* at the `lg:` breakpoint itself (1024px) the 25% zones drop to ~170–200px content width, which would squeeze the budget card's dense line. Acceptable because the layout stacks at smaller viewports (`grid-cols-1` below `lg`), and the primary-goal test is specifically at 1440px.

- **Tooltips via shadcn primitive, not native `title`.** The Phase 3a initial pass used the HTML `title` attribute on the recent-runs `Link`. Native browser tooltips are unreliable: delay is OS-dependent, visual styling is OS-dependent, and some browsers suppress the title attribute on anchor elements in certain cases. Replaced with `<Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip>` from `@/components/ui/tooltip`, which is already project-standard (e.g., `HintIcon` in `agent-config-primitives.tsx:70`). The `TooltipProvider` is globally mounted in `main.tsx`, so no local provider needed.
  - *Lens — Doherty Threshold:* shadcn Tooltip defaults to `delayDuration={0}` at the provider level, giving sub-100ms open. Native browser tooltips typically wait ~500ms before showing.
  - *Lens — Jakob's Law:* styled tooltips match the rest of the app's hover-help vocabulary; users expect this look and behavior.
  - *Content:* tooltip body now carries the full concept-specified triplet — run id + outcome + relative time. The previous `title` attribute was missing the run id.
  - *Accessibility:* the `aria-label` on the `<Link>` is retained for screen-reader announcements; the visual tooltip is a separate affordance.

### DS deviations

None introduced in this polish. `TooltipProvider` was already mounted globally; `Tooltip` primitives are standard shadcn pattern already used elsewhere.

### Findings surfaced

- The Phase 3a initial tooltip implementation using native `title` was a miss — the concept explicitly specified interactive tooltips as part of the recent-runs deliverable, and native title attributes are not reliable cross-browser. Trust the DS tooltip primitive by default for any hover-content requirement in future phases.

---

## Phase 3a polish round 2 — compact run feed replaces icon strip

Concept-level revision, not a layout tweak. The Phase 3a icon strip (§7 of the concept) looked compact but proved information-sparse — run id, outcome detail, and timestamp all required hover to decode. A three-row compact feed below the Latest Run card reads everything at a glance.

### Decisions

- **Recent-runs icon strip removed; 3 compact rows take its place.** Each row is a single `<Link>` with: colored status icon (12px), mono run-id (8 chars), status label (text, replace underscores with spaces), and right-aligned relative time. Rows sit in a bordered container with `border-t` separators between them (not `divide-y` — explicit per-row treatment is more composable when future work adds row-level affordances).
  - *Lens — Jakob's Law:* the Latest Run card is already the user's mental model for "one run" — icon + id + status + time. Compact rows reuse the vocabulary at lower visual weight.
  - *Lens — Recognition over Recall:* users see outcomes in the row itself; hover isn't required to decode. Failed runs pop at a glance.
  - *Lens — Information Scent:* a monitoring user scanning the feed can spot a recent pattern (e.g., three consecutive failures) without interacting. The icon strip required hover per-dot.
  - *Lens — Serial Position + Miller's Law:* 3 prior rows + 1 Latest Run card = 4 items, well within working-memory limits. Primary-vs-secondary hierarchy stays clean — the card dominates, the feed supports.

- **Hero collapses back to 75/25 two-zone.** Left zone expands to 75% (activity pill + Latest Run card + prior-runs feed + idle hint). Right zone shrinks to 25% with the budget card alone. The three-zone layout from polish round 1 is gone — the feed needs the card's width to read cleanly at `text-xs`, and a 25% zone would have squeezed the relative-time column unreasonably.
  - Budget card at 25% was already verified in polish round 1; no change to its readability.

- **Latest Run selection moved out of `LatestRunCard` into the caller.** `LatestRunCard` signature changed from `{ runs, agentId }` to `{ run, agentId }`. The caller (`AgentOverview`) now owns the sort/find/latest/prior computation via a single `sortedRuns` memo, then derives `latestRun = liveRun ?? sortedRuns[0]` and `priorRuns = sortedRuns.filter(r => r.id !== latestRun.id).slice(0, 3)`. Simpler component, caller handles zero-runs and duplication avoidance.
  - *Why in the caller:* the prior-runs feed needs to know which run the Latest Run card is showing, to exclude it. Keeping selection inside `LatestRunCard` would require an awkward callback or duplicated logic.

- **No tooltips on the compact rows.** All information is visible in the row itself — tooltip would be redundant. `aria-label` isn't set either since the row content is already readable text; the `<Link>` has its own discoverable text for screen readers.

### DS deviations — "pass with explicit justification"

- **Compact rows use `px-3 py-1.5 text-xs`.** Mirrors the density of `EntityRow` (used in the in-flight tasks list below) for visual rhythm. No new tokens; standard Tailwind spacing from the existing scale.
- **`border-t` between rows instead of wrapping each row in a border.** Matches the `EntityRow` pattern (in-flight tasks list) where rows use `border-b` on all but the last. Same effect, same DS vocabulary.

### Findings surfaced

- **`runStatusIcons` is still the source of truth.** The icon + color pair drives both the Latest Run card's status row and the compact feed rows. Consistent across the module; no drift.
- **Edge case: live run not at position 0.** If there are runs created after the live run that already finished (unlikely but possible with overlapping executions), the compact feed would show those newer-completed runs above older-completed runs, skipping the live run's timeline position. The Latest Run card still correctly shows the live run. This is an edge case and the concept's spec ("3 runs before the Latest Run, not including it") is what drives the behavior — filtering by id is correct per spec.
- **Empty-state symmetry.** With the icon strip gone, the prior-runs feed simply doesn't render when there are fewer than 2 runs total. No "No prior runs yet" message — the zero/one-run case doesn't warrant a placeholder below an already-informative Latest Run card (or its own "No runs yet" fallback). `Progressive Disclosure` in action.

### Rubric alignment check

- **Section 1 item 3 (recent health):** satisfied — arguably stronger than the icon strip. Three runs with full outcome + timestamp in the monitoring frame, no interaction needed.
- **Section 1 monitoring-no-scroll:** the feed adds ~75–90px of vertical height to the hero (3 rows × ~28px + dividers). Hero previously ~180–240px tall; now ~255–330px with feed present. Still well inside a 720px content-area budget at 1440×900.
- **Section 5 DS compliance:** sharp corners preserved on the feed container; no new tokens; no new components extracted; no rounded-corner deviations.
- **Section 6 "Hierarchy clarity":** Latest Run card remains dominant by size and content density; compact feed is visually secondary, reinforcing the primary-monitoring goal.
- **Section 6 "Visual restraint":** the feed replaces a decorative icon strip with scannable information rows — fewer visual tricks, more content. Net restraint gain.

### Concept doc updated

Added a "Phase 3a revision" note at the end of `run-a-concept.md` recording this drift from §7. The original §7 is preserved as authored; the revision supersedes it for implementation.

---

## Phase 3a polish round 3 — hero-spanning activity pill

Mode 2 alignment exploration resolved in favor of Option C (hero-spanning header). Three approaches were proposed inline; Option C picked for its semantic honesty, preserved cyan isolation, and zero-cost structural shift.

### Decision

The activity pill was lifted out of the left zone and promoted to a hero-spanning position above the 75/25 grid. Latest Run card and budget card now share a vertical baseline; no grid-level asymmetry at the tops.

### User's reasoning (approved option)

- **Semantic honesty.** The activity pill describes the *agent* overall, not the current-work column. Promoting it one level up reflects its actual scope.
- **Von Restorff preserved.** The cyan signal keeps its spatial isolation — important for rubric Section 6 "Live-run signal strength." Options B (absorb into card) and the three-running-signals-in-one-container problem would have compromised this.
- **Lowest structural cost.** Zero new elements, zero new tokens. The pill changes position, nothing else changes.
- **Sharpened Latest Run meaning.** The card now unambiguously reads as "a specific run," not "what the agent is doing." Cleaner conceptual separation between agent-level and run-level state.
- **Graceful zero-runs.** No conditional complexity — the pill lives in the hero header regardless of whether there are any runs; the left zone's fallback "No runs yet" card sits cleanly in its slot.

**Why not Option A (symmetric eyebrows):** introduced a new informational signal (budget state indicator) to solve a layout problem — symptom-treating rather than root-cause.

**Why not Option B (pill into card):** three "running" signals inside one card (pill row + StatusBadge + cyan Loader2) reads as noise; loses spatial Von Restorff.

### Pill-grounding treatment (my call)

The risk flagged in the proposal was the pill looking "lonely" alone above a wide 1440px grid. Chose tight-proximity grounding rather than a visible separator:

- Hero wrapper uses `space-y-3` (12px), matching the existing intra-zone rhythm. The pill sits 12px above the grid — same gap as pill-to-card was in the prior layout.
- **No border-b** below the pill. A horizontal rule would read as "section divider," which is heavier than the pill deserves — the pill is a small element, not a section head. Proximity alone groups it with the grid below.
- **No decorative elevation** (no subtle bg, no padding container). The pill keeps its minimal dot + text treatment from earlier phases. *Aesthetic-Usability Effect*: restraint here.

**Principle cited:** Gestalt — *Proximity* over *Uniform Connectedness*. 12px between pill and grid is short enough that the eye groups them as one unit without needing a visual connector.

### Structural change

- `AgentOverview` hero block now wraps in an outer `space-y-3` container.
- First child: activity pill (flex row — dot + label).
- Second child: the existing `grid grid-cols-1 lg:grid-cols-[3fr_1fr]` with left and right zones. Left zone's internal `space-y-3` unchanged — now it starts directly with the Latest Run card (no pill).
- The outer `space-y-8` that separates the hero from the chart band below is preserved on the parent `AgentOverview` div.

### 1440px no-scroll

Expected delta was +4–8px. Confirmed negligible in practice: hero gains ~20px at the top (pill moved up) but left zone shrinks by ~20px (pill removed from its stack). Net increase is just the space-y-3 gap between the pill and the grid vs. the pill-to-card gap when it lived inside the left zone — zero to within rounding.

### DS compliance

Neutral. No new tokens, no new components, no new raw-palette classes. The change is pure DOM restructuring of existing elements.

### Residual items for Phase 3b onwards

- Right zone is now visually sparse (budget card only, ~140px tall). The chart band in Phase 3b may naturally fill space below the right zone; not a current-phase concern.
- If the smoke test finds the pill still looks lonely despite proximity grounding, a minimal alternative is to swap `space-y-3` to `space-y-2` (tighter) — one-line change. No escalation to borders or backgrounds unless that fails first.

---

## Phase 3b — Chart consolidation

### Decisions

- **Four charts → one.** Dropped `PriorityChart`, `IssueStatusChart`, and `SuccessRateChart` from the dashboard composition. Kept `RunActivityChart` as the single surviving chart; it's the only uniquely-dashboard-shaped temporal signal. The three dropped charts all duplicated data that lives elsewhere:
  - Issues by Priority → reachable via `/issues?participantAgentId=<id>` + priority filter (1 interaction via the existing "View all →" link on the in-flight tasks list).
  - Issues by Status → same path, status filter.
  - Success Rate → merged into the Run Activity subtitle as a caption (concept §2).
  - *Lens — Information Scent:* each dropped chart had a clear, single-click scent path to its canonical home. Removing them from the dashboard doesn't hide data, it surfaces the right chart by removing competing ones.
  - *Lens — Hick's Law / Choice Overload:* four adjacent charts imply four questions for the user to triage. One chart states one question clearly.
  - *Lens — Pareto (80/20):* run activity is the 20% that does the 80% of the work for monitoring-and-debug users; the other three charts fail that ratio.

- **Success Rate rendered as subtitle.** Format: `N% success · Last 14 days` when there are runs in the window; plain `Last 14 days` when there are none. Computed inline in `AgentOverview` from the `runs` array with a cutoff at `now - 14 days`.
  - *Formula:* `succeeded / total` (same as the dropped `SuccessRateChart`) — matches the stacked bars the user reads visually above the subtitle. Using `succeeded / (succeeded + failed)` would give a different number than the visual proportion suggests.
  - *Lens — Aesthetic-Usability Effect + Prägnanz:* caption is the simplest representation that carries the signal. A line overlay would reintroduce the competing-axes problem that the consolidation was supposed to solve.
  - *Lens — Recognition over Recall:* subtitle sits right next to the chart title in the existing `ChartCard` slot — users already look there for chart metadata.

- **Layout collapses from `grid-cols-4` to a single full-width `ChartCard`.** No wrapping grid needed; `ChartCard` is already a block-level `border border-border rounded-none p-4` container that spans the parent's width.

### DS deviations

None. Chart colors remain hardcoded hex inside `RunActivityChart` (no chart tokenization, per Step 0 policy). `ChartCard` reused as-is — no new wrapper, no new subtitle pattern invented.

### Reachability check for dropped chart data

- **Issues by Priority / Issues by Status:** the in-flight tasks list's "View all →" link (`/issues?participantAgentId=${agentId}`) routes to the Issues page. Priority and status filters on that page give the equivalent view. Two interactions max: click "View all," click the filter. Rubric Section 4 "chart data reachable within two interactions" — passes.
- **Success Rate:** visible as subtitle on the surviving chart card (zero interactions).

### 1440px no-scroll

Hero unchanged from Phase 3a polish round 3 — still passes. Chart band below the hero *shrinks* from 4-up at ~160–200px to a single card at similar height (the chart itself is the constraint, not the grid). Net: content below the fold is shorter and reads cleaner, which helps overall page rhythm.

### Imports cleaned

`PriorityChart`, `IssueStatusChart`, `SuccessRateChart` removed from `AgentDetail.tsx` imports — the components are still exported from `ActivityCharts.tsx` because `pages/Dashboard.tsx` (the company-level dashboard, different surface) still uses them. Scope-respecting: did not touch `Dashboard.tsx` or delete the unused-here components.

### Residual items for Phase 3c / 3d / 4

- **Carried forward:** the right edge of the Latest Run card doesn't currently align with the right edge of the content grid. Filed as a Phase 4 polish candidate; not addressed in 3b.
- **Possible follow-up for 3d (Costs):** with the chart band now small, the Costs module below the in-flight tasks has more room. May influence Phase 3d layout decisions.

---

## Phase 3b polish — chart legend and rich tooltips

Smoke-test surfaced a pre-existing gap: `RunActivityChart` had no legend and only a native-`title` tooltip showing daily total (no breakdown). Consolidation raised the chart's prominence, so the gap demanded a fix.

### Investigation

- **Legend:** `ChartLegend` helper existed in `ActivityCharts.tsx` and was used by `PriorityChart` + `IssueStatusChart`, but never by `RunActivityChart`. Pre-existing omission, not something the consolidation introduced.
- **Tooltips:** `RunActivityChart` used a native HTML `title` attribute on each day column (`${day}: ${total} runs`) — same unreliable mechanism we replaced in Phase 3a, and it only showed total (not the succeeded/failed/other breakdown that matches the stacked bars).
- **Other consumer:** `pages/Dashboard.tsx` also renders `RunActivityChart` (for the company-level dashboard). Any change to the shared component affects both surfaces.

### Scope-preserving implementation

- **Legend:** exported the existing `ChartLegend` helper (was file-private). Rendered inline in `AgentOverview` as a sibling of `RunActivityChart` inside `ChartCard`. Zero-touch to `RunActivityChart`. `Dashboard.tsx` unaffected — doesn't render the legend, doesn't import `ChartLegend`.
- **Tooltips:** added an opt-in `richTooltips?: boolean` prop to `RunActivityChart`. When `true`, each day column is wrapped in a shadcn `<Tooltip>` (already-established project pattern from Phase 3a polish) with content `{day; "Succeeded: N · Failed: N · Other: N"}`. When `false` (default), the existing native-`title` behavior is preserved. `Dashboard.tsx` doesn't pass the prop — unchanged behavior there.
- Bar markup was extracted into a local `bar` const so both branches (richTooltips on/off) share the identical rendering. No duplication.
- The rich-tooltip branch uses a `<button>` element as `TooltipTrigger asChild`'s child (not a `<div>`) for keyboard focusability — `Tooltip` from Radix expects a focusable trigger for the keyboard path. `cursor-default` preserves the visual mouse affordance (it's a trigger, not an action).

### Operating principles cited

- *Recognition over Recall:* legend makes each bar color's meaning recognizable without requiring the user to remember the convention. Without a legend, a user seeing red-and-gray bars has to infer red=failed and gray=other from context.
- *Information Scent:* hover tooltips give users the precise "what does this bar mean" detail they'll reach for. Breakdown-per-day is the actionable data for debug-mode users (identify which days had failures), not total count.
- *Doherty Threshold:* shadcn Tooltip with `delayDuration={0}` (provider default, set in `main.tsx`) opens near-instantly. Native `title` takes ~500ms.
- *Jakob's Law:* shadcn Tooltip is the project-standard hover-help vocabulary already used elsewhere (Phase 3a polish for recent-runs was the prior precedent — no longer in use, but the pattern is established).

### DS deviations

- **`bg-emerald-500`, `bg-red-500`, `bg-neutral-500` in the bars** — already present in the shared `RunActivityChart`; no drift introduced by this change.
- **Legend color literals** (`#10b981`, `#ef4444`, `#737373`) match the Tailwind hex values of those bar classes, mirroring the pattern already used by `PriorityChart` and `IssueStatusChart` when they call `ChartLegend`. No new hex introduced.
- **Legend renders all three categories unconditionally**, even if one has zero bars in the current window. Keeps the vocabulary stable across states — users always see what's possible.

### Cross-consumer surface check

`ActivityCharts.tsx` changes were:
1. Export `ChartLegend` (additive).
2. Import `Tooltip` primitives from `@/components/ui/tooltip` at the top of the file.
3. Add opt-in `richTooltips` prop to `RunActivityChart` (default off).

All three are backward-compatible. `Dashboard.tsx` (the other consumer) was not modified and continues to render `RunActivityChart` with its original native-`title` behavior.

Existing `ActivityCharts.test.tsx` passes unchanged (2 tests green).

### Deferred to Phase 4 — chart sparseness

The single wide chart at full content width feels thin with surrounding whitespace. **Not addressed now.** Premature to judge chart visual weight in isolation before Phase 3c (priority affordance) and Phase 3d (costs) land below. Candidate resolutions if the issue persists after 3d:
- Densify the chart (taller bars, integrate summary stats alongside).
- Narrow the chart to ~65% width with another meaningful module alongside (e.g., a summary-metrics card or small KPI strip).

Filed here so Phase 4 doesn't forget the observation.

---

## Phase 3c — Priority affordance

Wired the existing `PriorityIcon` popover picker into the in-flight tasks list. Click the priority icon on any row → 4-option popover → pick → row updates optimistically and may reposition per the priority-DESC sort.

### Decisions

- **Reused existing `PriorityIcon` component.** It already implements the full picker: `onChange` prop turns the icon into a shadcn `Popover` trigger that opens with 4 `<Button>` options, each highlighted with its own `PriorityIcon`. Keyboard-accessible (Tab between options, Enter picks, Escape closes) via shadcn + Radix defaults. Zero component invention, zero scope creep.
  - *Lens — Reach for what exists first:* the operating principle that maps directly to the DS-discipline decision point; the component fits, so it's used.
  - *Lens — Jakob's Law:* the picker behavior matches `IssueDetail.tsx:2325` and `IssueProperties.tsx:1068`, so users who've changed priority elsewhere recognize the pattern here.

- **Optimistic update scoped to the dashboard's query cache.** The mutation targets `[...queryKeys.issues.list(companyId), "participant-agent", agentId]` only — the specific cache slice that feeds `assignedIssues` → `inFlightTasks`. On success, invalidates the full `queryKeys.issues.list(companyId)` prefix so any other dependent view (if open) refreshes. Lighter than `IssueDetail`'s full `applyOptimisticIssueCacheUpdate` because the dashboard doesn't need to maintain per-issue detail caches.

- **Row reposition via existing sort memo.** The `inFlightTasks` useMemo already sorts by priority-DESC then updatedAt-DESC. When the optimistic cache update mutates an issue's priority, the memo recomputes and the row lands in its new bucket. No explicit animation framework — just React re-render.
  - *Lens — Doherty Threshold:* optimistic updates put the visible change <100ms from the click, well inside the 400ms threshold.
  - *Lens — Causality (Norman / purposeful animation):* the reposition *is* the feedback that the priority change succeeded. Combined with the highlight flash (below), the user sees "I clicked, priority flipped, row moved, row glowed."

- **Highlight flash on the changed row.** After picking a new priority, the row shows a 1000ms `bg-accent/30` highlight via local `recentlyChangedId` state. `transition-colors` (already on `EntityRow`) fades the color in and out. When the row repositions, the highlight travels with it — reinforces that the repositioned row is the one that was just edited.
  - *Lens — Zeigarnik / Goal-Gradient:* the brief highlight "closes the loop" on the priority-change action, giving visible completion.
  - *Lens — Aesthetic-Usability Effect:* 1000ms is enough to register, short enough not to feel like a modal interruption. Using `bg-accent/30` (existing DS token, same as `hover:bg-accent/50` one step brighter) keeps the decoration quiet.

- **Click-stopper wrapper around `PriorityIcon` inside `EntityRow`.** The `EntityRow` renders as a `<Link>` when `to` is passed; the `PriorityIcon` popover trigger sits inside that Link. Without intervention, clicking the priority icon would also trigger Link navigation. Wrapped the icon in a `<span>` with `onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}` and `onKeyDown` that stops Enter/Space bubbling. Click stays inside the popover trigger; keyboard Enter on the focused trigger doesn't leak to the Link.

- **No client-side permission gate.** Matches the existing `IssueDetail.tsx` pattern (priority changes flow through `updateIssue.mutate` without a client-side role check). If a user lacks server-side permission, the mutation will error and `onError` pushes an error toast with the server message. Flagging: **this matches the existing app behavior but isn't defensive.** If a product decision wants dashboard-specific gating, that's a new requirement — not something Phase 3c invents silently.

- **Error handling.** `onError` restores the previous cache snapshot (cached in `onMutate`'s return) and pushes a shadcn toast with the server error message or a default "Could not save priority." Users see both the row reverting and an explanation. `onSettled` unconditionally invalidates the issues list so the UI converges on server state after any error.

### Rubric alignment

- **Section 3, Change task priority:** pass. Explicit selector on each of up to 7 in-flight task rows, scoped to the 4-value `critical | high | medium | low` enum. Keyboard-navigable, satisfies the "drag-and-drop or keyboard-reorderable" rubric item via the keyboard path cleanly.
- **Section 2, Operations:** pass. Teammates can change priority from the dashboard without leaving the page; mutation is scoped to this specific view.
- **Section 3, Navigate to detail:** unchanged — clicking anywhere else on the row still routes to `/issues/{identifier}`.

### DS deviations — "pass with explicit justification"

- **`PopoverContent` uses `rounded-md`** (inherited from shadcn's primitive). The dashboard aesthetic prefers `rounded-none`, but shadcn primitives are an accepted exemption per Step 0 DS policy. Overriding would require a local className override on every popover usage across the codebase — not scoped to Phase 3c. Same treatment applies to `Button` inside the popover (likely `rounded-md` from shadcn Button variants). Noted as inherited, not introduced.
- **`bg-accent/30` for the highlight flash.** `bg-accent` is an existing DS token; `/30` opacity is standard Tailwind modifier syntax. No new token, no new raw-palette drift.

### Findings surfaced

- **Nested-interactive DOM.** `<Link>` > `<PopoverTrigger as button>` is a known a11y warning pattern (nested interactive elements). Screen readers announce both elements; users can still operate both via keyboard (focus the outer Link, Tab to the inner trigger). The existing `EntityRow` component assumes this pattern is acceptable given its `to`-prop contract. **Not fixed in Phase 3c** — the cleanest fix would restructure the row to not wrap the whole thing in a Link (title becomes the only Link; hover affordance moves to a shared `group-hover` class), which is a wider EntityRow refactor. Filed as a Phase 4 candidate if someone cares.
- **Tab order inside the popover is sequential, not menu-like.** `Popover` + shadcn `Button` children support Tab/Shift-Tab navigation between options. Arrow keys don't navigate like a `DropdownMenu` would. The concept said "arrow keys or Tab" — Tab satisfies. For a richer keyboard UX (arrows navigate options), swap `Popover` for `DropdownMenu` — but that'd require modifying `PriorityIcon`, a shared component, touching `IssueDetail` + `IssueProperties` + this page simultaneously. Out of scope.
- **Permission model mirrors app pattern, which is "anyone who can view can edit."** If product wants tighter gating, it needs a dedicated decision + a server-side permission check. Out of scope here; flagging for product awareness.

### Test coverage

Existing `ActivityCharts.test.tsx` still passes (2 tests). No new tests added — no new component to test; `PriorityIcon` has its own test coverage in the project.

### Residual items for Phase 3d / 4

- Costs module (Phase 3d) may surface the overall page rhythm tradeoffs that inform the "chart sparseness" deferred item.
- Nested-interactive a11y pattern on the in-flight row — flagged above, filed for Phase 4 consideration.

---

## Phase 3d — Unified costs

The Phase 0 baseline was two stacked bordered cards: KPI strip (Input / Output / Cached / Cost grid) and per-run table. Visual fragmentation made them read as "two things about cost" rather than one accountability surface. Phase 3d merges them into a single bordered container with an inline summary line above a borderless table.

### Decisions

- **One container, two bands.** Outer `border border-border rounded-none` wrapping the summary block (`p-4`) and the table (no inner borders). A single `border-t` on the `thead` row separates summary from detail.
  - *Lens — Common Region (Gestalt):* one bounded area reads as one module. The previous two-card treatment invited "these are separate things" interpretation.
  - *Lens — Prägnanz:* simpler shape, one outline rather than two.

- **Title inside the module.** "Costs — session" moved from an external `<h3>` (in `AgentOverview`) to the module itself as a small eyebrow label (`text-xs text-muted-foreground`). Matches the `ChartCard` pattern (self-contained module with title); differs from the in-flight-tasks pattern (external `<h3>` + "View all" action on the same row). Choice made because costs has no sibling action to pair with at heading level — the table's column headers are enough. In-flight tasks keeps its external h3 because "View all →" belongs at the module head.
  - *Lens — Jakob's Law:* internal-title matches the `ChartCard` module the user already read on this page.

- **Summary collapsed to one inline line.** Four cells of `text-lg` tokens (old KPI grid) shrink to:
  ```
  $1.42 cumulative · 142k in · 38k out · 12k cached
  ```
  Cumulative cost gets `text-sm font-semibold` (primary signal — managers scan for spend). Token counts get `text-xs text-muted-foreground` (secondary — engineers needing detail scan for in/out/cached). Middots separate items; all items sit on a single `flex flex-wrap items-baseline` line that wraps gracefully on narrow viewports.
  - *Lens — Progressive Disclosure:* glanceable summary at the top; table below fulfills "show me per-run."
  - *Lens — Information Scent:* the summary signals "cost overview"; the table header signals "per-run breakdown." Sequential, not competing.
  - *Lens — Aesthetic-Usability Effect:* a dense one-liner is less visually noisy than a 4-cell grid, freeing the module's vertical budget for the table that matters to debug/accountability users.

- **Table treatment.** Kept the existing columns (Date, Run, Input, Output, Cost) and their formatting (`tabular-nums` on numeric columns, `font-mono` on run id, 10-row cap). Removed the inner border on the table's container since the outer module border now frames it. Rows separated by `border-t` (top) instead of `border-b` (bottom) + `last:border-b-0` — same visual, simpler logic (no last-child special case).
  - *Header row `bg-accent/20`* — preserved from Phase 0 baseline, carries the "here are column headers" cue.

- **Empty-state strategy.**
  - *Neither runtime state nor runs-with-cost:* one compact card, "Costs — session" eyebrow + "No cost data yet." No mystery whitespace.
  - *Runtime state exists, zero runs-with-cost:* summary renders; table hidden. The summary carries the signal alone.
  - *Runs-with-cost exist, no runtime state:* table renders; summary hidden. The per-run detail carries the signal alone. No fallback-aggregation synth — the concept §5 permits "hide the summary" when the session data is missing, and faking a summary from aggregated runs would mix vocabularies (session-scoped vs. all-runs). Honest.
  - *Both present:* both render, separated by the single `border-t` on the table header row.

### DS deviations — "pass with explicit justification"

None introduced. All classes used (`border-border`, `rounded-none`, `bg-accent/20`, `text-muted-foreground`, `text-xs/sm`, `font-semibold`, `font-mono`, `tabular-nums`) were already present in the dashboard region or elsewhere in `CostsSection`.

### Scope preserved

- `CostsSection`'s data sources unchanged — still pulls from `runtimeState` + `runs`. No new queries, no new hooks.
- `AgentOverview` JSX only lost the external `<h3>Costs</h3>` wrapper; otherwise untouched.
- `runMetrics`, `formatCents`, `formatTokens`, `formatDate`, `visibleRunCostUsd` reused as-is.

### 1440px no-scroll

Hero unaffected. The unified costs module is shorter than the stacked-card version (single border, single `p-4` summary vs. two separately-padded cards + the external h3 that's now gone), which tightens overall page rhythm and partially addresses the "chart sparseness" deferred observation by making below-the-fold feel less stretched.

### Findings surfaced

- **Per-task cost attribution is weak.** Re-confirming the Phase 0 discovery finding: `HeartbeatRun` has no reliable link to `Issue` at the type level. The per-run table shows cost per run (run id + tokens + dollars), but users can't answer "which task consumed the most" from this view alone. A real per-task rollup would need either an `issueId` on heartbeat runs or a `contextSnapshot` join — both data-model changes, out of scope. Matters for rubric Section 2 "Accountability (spend)": the module serves "which runs were expensive" (engineer debug) but not "which tasks were expensive" (manager). Flagging for comparison writeup.
- **Summary copy wording.** "$1.42 cumulative" reads as "session cumulative" — `runtimeState.totalCostCents` is session-lifetime, not calendar-month. A user glancing at this could confuse it with the hero budget's calendar-month `observed` number. Context mitigates this (the eyebrow label says "session" explicitly), but worth flagging: two "cost numbers" on the same dashboard at different scopes is a legible-but-fragile vocabulary. No fix here; the concept §5 explicitly scoped this to session.

### Residual items for Phase 4

- **Chart sparseness** (deferred from Phase 3b polish) — revisit now that the full dashboard is in place. The shorter costs module may already have rebalanced the page.
- **Latest Run card right-edge alignment** (deferred from Phase 3b) — filed candidate.
- **Nested-interactive a11y** on in-flight row (deferred from Phase 3c) — filed candidate.
- **Per-task cost attribution** (this phase) — data-model finding; out of redesign scope; include in comparison writeup.
- **"Cumulative session" vs "month-to-date observed" vocabulary overlap** between costs and budget — fragile-but-legible, flagged.
