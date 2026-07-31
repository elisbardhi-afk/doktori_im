# JIRA Backlog Orchestrator — Design

**Date:** 2026-07-31
**Status:** Approved (pending spec review)
**Scope:** Rewrite the `/process-jira-backlog` skill into a multi-agent orchestrator that deploys specialized developer and tester agents (plus planner, reviewer, integrator) to implement and verify every JIRA backlog item to a high quality bar.

---

## 1. Problem & Goals

The current `/process-jira-backlog` skill processes each JIRA issue sequentially **inside one context**: fetch → route (Feature vs Bug/Task/Story) → implement → set "In Review" → comment. Everything — planning, coding, testing, git, JIRA — happens in a single agent's head.

**Goal:** Replace this with an **orchestrator** that deploys specialized agents in the right order so every idea, bug, or story is implemented *and verified* in the best way possible. Verification must include **live browser testing via the Playwright MCP**, not just unit tests, because the app's critical requirement is flawless booking (no double-booking, correct DST, all slots bookable).

### Success criteria

- `/process-jira-backlog` deploys a pipeline of specialized agents per issue instead of doing everything inline.
- Every code-producing issue passes **both** an independent code review **and** a test stage (unit + build + live Playwright MCP browser check) before it is marked "In Review".
- Booking/availability/DST changes are explicitly checked for double-booking and DST correctness.
- Issues that cannot be made green after bounded retries are left on their branch and flagged for human attention — never falsely marked "In Review".
- The existing JIRA mechanics (fetch, transitions, ADF comments, branching rules) are preserved.

### Non-goals

- Parallel processing across issues (explicitly sequential — see §7).
- A committed Playwright regression suite (verification is live-drive via MCP; codifying specs is future work).
- Changing JIRA board configuration, statuses, or transition IDs.

---

## 2. Key Decisions (locked with user)

| Decision | Choice | Rationale |
|---|---|---|
| Browser testing | **Playwright MCP (live drive)** | Exploratory verification of real flows; no committed spec files needed yet. |
| Orchestration mechanism | **Hybrid** | Orchestrator (main session) sequences issues + owns JIRA; a deterministic **Workflow** runs the per-issue dev→review→test→fix loop with bounded retries. |
| Agent roster | **Planner, Developer, Code Reviewer, Tester, Integrator** | Five roles; each has one clear responsibility and a minimal toolset. |
| Packaging | **Rewrite `/process-jira-backlog`** | Single entry point; calling the skill deploys the pipeline. |
| Playwright prerequisite | **Skill self-configures + user restarts** | On first run the skill writes `@playwright/mcp` into project `.mcp.json`, halts, and asks the user to restart so tools connect. |
| Concurrency | **Sequential across issues** | Shared codebase; no merge conflicts or interleaved edits. Matches the "flawless booking" bar. |

---

## 3. Architecture

### 3.1 Components

```
/process-jira-backlog  (skill, runs in MAIN SESSION = the Orchestrator)
│
├─ Step 0  Prerequisite check   (Playwright MCP present? else configure + halt)
├─ Step 1  Fetch backlog        (curl JIRA, To Do only, skip Epics)
├─ Step 2  Sequence issues      (one at a time, created-order)
│           └─ per issue ──────► Inner Workflow  (deterministic)
│                                 Planner? → [Developer → Reviewer → Tester]↺ → Integrator
└─ Step 3  Final report         (issue → outcome → branch → evidence)
```

### 3.2 Agent roster

Agents are defined as reusable subagent definitions in `.claude/agents/*.md` (project-scoped). Each has a focused system prompt and a minimal tool allowlist.

| Agent | File | Responsibility | Tools (allowlist) | Returns |
|---|---|---|---|---|
| **Planner** | `jira-planner.md` | Feature issues only: analyze requirements, edge cases, and produce a concrete step-by-step implementation plan the Developer must follow. Read-only. | Read, Grep, Glob | Plan (structured: steps, files to touch, edge cases, test scenarios) |
| **Developer** | `jira-developer.md` | Implement the change/fix on the correct branch following the plan (Features) or the issue description (Bug/Task/Story). Addresses review/test feedback on retries. | Read, Edit, Write, Grep, Glob, Bash | `{summary, filesChanged[], notes}` |
| **Code Reviewer** | `jira-reviewer.md` | Audit the diff for correctness, **double-booking & DST risk**, and CLAUDE.md compliance. Read-only. | Read, Grep, Glob, Bash (read-only cmds) | `{approved: bool, issues[]}` |
| **Tester** | `jira-tester.md` | Run `typecheck + lint + vitest + build`; then live-drive the **Playwright MCP** against `next dev` for the affected flow. | Bash, Playwright MCP tools | `{passed: bool, unit, build, browser, failures[]}` |
| **Integrator** | `jira-integrator.md` | On green/green only: commit, push branch, transition JIRA → In Review, post ADF comment. | Bash | `{committed, branch, jiraTransitioned, commentPosted}` |

> **Toolset note:** the exact tool names available to subagents follow the host's agent configuration. The allowlists above express intent (least privilege); the Reviewer is read-only, the Tester cannot edit source, only the Developer and Integrator mutate the repo.

### 3.3 Why these boundaries

- **Separation of duties**: the agent that writes code does not also judge whether it is correct (Reviewer) or whether it works (Tester). This is the core quality mechanism.
- **Least privilege**: Reviewer/Tester cannot edit source, so a "green" verdict is trustworthy.
- **Single responsibility**: each agent is small enough to reason about and hands off through a well-defined structured result.

---

## 4. Per-Issue Inner Workflow (deterministic)

Implemented with the **Workflow** tool so retries and fan-in are deterministic. The orchestrator calls it once per issue.

```
                 ┌──────────── Feature only ────────────┐
 issue ─┬─(Feature)─► Planner ─► plan ─┐                 │
        │                              ▼                 │
        └─(Bug/Task/Story)────────► [ Developer ]        │
                                        │                │
                                        ▼                │
                                   [ Reviewer ]  ── issues ─┐
                                        │ approved          │
                                        ▼                   │
                                   [  Tester  ]  ── failures ┤
                                        │ passed            │
                                        ▼                   │
                                   [ Integrator ]           │
                                                            │
        round++ ; if round > 3 → ESCALATE  ◄────────────────┘
        else Developer retries with combined feedback
```

### 4.1 Routing

Detected by the orchestrator before invoking the workflow, mirroring the current skill:

- **Feature** — title starts with "Feature" (case-insensitive). Branch `feature/<slug>`. Planner runs first.
- **Bug / Task / Story** — title does NOT start with "Feature". Shared branch `fix/jira-batch-<YYYY-MM-DD>`. No planner.

### 4.2 The review/test loop

- One **round** = Developer → Reviewer → Tester.
- Advance to Integrator only when **Reviewer.approved == true AND Tester.passed == true**.
- If either fails, the Developer receives the **combined** `{review.issues, test.failures}` and produces a new round.
- **Max 3 rounds.** After the 3rd failed round → **Escalate** (see §6).

### 4.3 Stage details

- **Planner** (Feature only): produces the plan. If the app has no relevant codebase for the issue, it produces an analysis-only plan and the workflow routes to analysis-only completion (Integrator posts the plan as the comment, no code).
- **Developer**: makes the smallest correct change. On round 1 follows plan/description; on later rounds addresses feedback specifically. Never touches git remotes or JIRA (that's the Integrator).
- **Reviewer**: checks correctness and, for any change touching availability/booking/slots/timezones, **explicitly verifies no double-booking path and correct DST handling** per CLAUDE.md. Returns actionable issues.
- **Tester**:
  1. `npm run typecheck`, `npm run lint`, `npm run test` (vitest), `npm run build`.
  2. Start (or reuse) `next dev`; use Playwright MCP tools (`browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.) to exercise the affected user flow.
  3. Return structured pass/fail with concrete failure evidence.
- **Integrator**: commits with a message in the project's style (`type: description`, **no Co-Authored-By** per user preference), pushes the branch, fetches the correct transition ID, transitions to In Review, posts the ADF comment.

---

## 5. Orchestrator Step 0 — Playwright MCP prerequisite

Because the Playwright MCP is **not currently connected** to this project's session, the skill self-provisions it:

1. On start, detect whether Playwright MCP browser tools are available in the session.
2. **If present** → proceed normally.
3. **If absent**:
   - Ensure a project `.mcp.json` exists and add a `playwright` server entry:
     ```json
     { "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] } } }
     ```
   - Print a clear message: *"Playwright MCP added to .mcp.json. Restart the session (or reload the window) to connect the browser tools, then re-run /process-jira-backlog."*
   - **Halt the run** (do not process issues without the browser tools available).
4. On the next run the tools are live and Step 0 passes. This is a one-time setup.

> This keeps the "test with Playwright MCP" requirement a hard part of the pipeline while making the missing-server situation self-healing.

---

## 6. Error Handling & Escalation

| Situation | Handling |
|---|---|
| Agent returns null / crashes | Treated as a failed round; feedback = "agent did not complete", retry. |
| 3 failed rounds | **Escalate**: leave code on its branch, do **not** transition to In Review. Post a JIRA comment summarizing what was attempted, the outstanding review issues / test failures, and that human attention is needed. Continue to the next issue. |
| Playwright MCP tools missing at Tester time | Should not happen after Step 0, but if it does: fail the test stage with a clear message rather than silently skipping browser verification. |
| Issue has no description | Developer implements the most reasonable interpretation; if truly unactionable, escalate with a "needs clarification" comment. |
| Cross-project / no accessible codebase | Planner/Developer produce an analysis-only plan; Integrator posts it as the comment, states no code changes, transitions to In Review. |
| Booking/DST-touching change | Reviewer MUST explicitly confirm no double-booking path and correct DST handling before approving. Non-negotiable per CLAUDE.md. |

---

## 7. Concurrency & Branching

- **Sequential** across issues: issue N is fully implemented, verified, and integrated (or escalated) before issue N+1 begins. No worktrees, no parallel edits, no merge conflicts.
- **Branching** (unchanged from current skill + CLAUDE.md):
  - Feature → `feature/<slugified-title>` off `main`.
  - Bug/Task/Story → one shared `fix/jira-batch-<YYYY-MM-DD>` off `main` for the whole run.
- **Commits**: project style `type: description`, no Co-Authored-By attribution.

---

## 8. Preserved JIRA Mechanics

Carried over verbatim from the existing skill (see current SKILL.md):

- **Credentials**: `~/.claude/mcp.json` → `jira`/`atlassian` server env (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`).
- **Fetch**: `GET /rest/api/3/search/jql?jql=statusCategory=new AND issuetype in (Task,Bug,Story) ORDER BY created DESC&fields=...`. Broaden by dropping the issuetype filter if empty. Skip Epics.
- **Transitions**: `GET /issue/<KEY>/transitions` first; known IDs for `ioochatbot.atlassian.net`: `31`=In Review, `21`=In Progress, `11`=To Do, `41`=Done.
- **Comments**: Atlassian Document Format (ADF) JSON.
- Only process `statusCategory = new` (To Do); never re-process In Review / In Progress.

---

## 9. File Layout (to be produced by implementation)

```
.claude/agents/
  jira-planner.md
  jira-developer.md
  jira-reviewer.md
  jira-tester.md
  jira-integrator.md

~/.claude/skills/process-jira-backlog/
  SKILL.md            (rewritten: orchestrator + Step 0 + agent deployment)
  references/
    inner-workflow.md (the deterministic dev→review→test→fix Workflow script/pseudocode)
    agent-contracts.md (structured input/output schema for each agent handoff)

<project>/.mcp.json    (playwright server entry added by Step 0 if missing)
```

> The skill lives in the user skills dir (`~/.claude/skills/process-jira-backlog/`), consistent with where it currently resides. Agent definitions are project-scoped so they can reference the doktori_im stack directly.

---

## 10. Verification of the Orchestrator Itself

This work product is skill + agent-definition Markdown (plus a `.mcp.json` edit), not application code, so:

- **Static check**: agent files parse (valid frontmatter), tool allowlists are sane, SKILL.md references resolve.
- **End-to-end dry run**: run `/process-jira-backlog` against the real JIRA backlog and drive **one** issue fully through the pipeline — confirm Planner→Developer→Reviewer→Tester→Integrator hand off correctly, the Playwright MCP browser check executes, and the JIRA transition + ADF comment land. This is the acceptance test for the whole design.

---

## 11. Open Risks

- **Playwright MCP first-run friction**: requires a session restart once. Mitigated by the clear Step 0 message; acceptable as a one-time cost.
- **Live-drive flakiness**: browser verification can be non-deterministic. Mitigated by the Tester returning concrete evidence and the bounded-retry loop; genuinely flaky results surface as escalations rather than false greens.
- **Subagent tool-name variance**: exact tool identifiers depend on the host. The implementation plan will confirm the actual tool names/allowlist syntax available for `.claude/agents/*.md` on this system before finalizing the agent files.
