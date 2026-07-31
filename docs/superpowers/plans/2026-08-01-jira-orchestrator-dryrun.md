# JIRA Orchestrator — Acceptance Dry Run (Task 9)

**Date:** 2026-08-01
**Branch:** `ai/orchestrator`
**Spec:** [2026-07-31-jira-orchestrator-design.md](../specs/2026-07-31-jira-orchestrator-design.md) §10
**Plan:** [2026-07-31-jira-orchestrator.md](2026-07-31-jira-orchestrator.md)

This document is the acceptance-test record for the multi-agent rewrite of
`/process-jira-backlog`. It captures build/verification status and the exact
procedure for the live end-to-end dry run.

---

## Status: BLOCKED on one-time Playwright MCP session restart

All eight build tasks are complete, committed, and have passed a final
whole-branch review (see below). The **live** dry run — driving one real JIRA
issue through Planner→Developer→Reviewer→Tester→Integrator with an actual
Playwright browser check — **cannot execute in the current session** because
the Playwright MCP browser tools are not yet connected.

This is the expected, designed Step 0 flow (spec §5): on first run the skill
provisions `@playwright/mcp` into the project `.mcp.json` and halts for a
session restart so the tools connect. The `.mcp.json` entry is already in
place (committed at `491230c`), so the restart is the only remaining
prerequisite.

**To run the acceptance test:** restart the session (reload the window), then
invoke `/process-jira-backlog`. Step 0 will detect the now-connected browser
tools and proceed.

---

## What IS verified (static + review)

| Check | Result |
|---|---|
| All 5 agent files parse (valid frontmatter, sane tool allowlists) | ✅ |
| Least-privilege model holds (Planner/Reviewer/Tester read-only; only Developer + Integrator mutate) | ✅ |
| Tester can reach Playwright MCP (`mcp__playwright` server grant) | ✅ (fixed in `d8c46e8`) |
| SKILL.md contains Step 0, agent names, contract/loop references | ✅ |
| Contract shapes consistent across all producers/consumers | ✅ |
| Integrator supports both normal and analysis-only modes | ✅ (fixed in `d8c46e8`) |
| Final whole-branch review (opus) | CHANGES REQUIRED → 6 fixes → **RE-REVIEW PASS** |
| JIRA reachable; backlog has processable To-Do issues | ✅ |

### Final review outcome

The whole-branch review found two blocking defects and one important
escape-hatch, all now fixed and re-reviewed clean:

- **C1** — Tester's `tools:` lacked an MCP grant, so it could never call the
  browser tools; every code-producing issue would have exhausted 3 rounds and
  ESCALATED. Fixed by adding `mcp__playwright` (server-level grant).
- **I1** — Integrator had no analysis-only path though the workflow dispatches
  it in that mode. Fixed by adding an explicit analysis-only branch and
  `committed:false` output shape.
- **I2** — `TestResult.browser` had a "false is acceptable" clause that
  allowed a false green. Fixed: browser is a required gate for any code diff.
- **M1/M2/M3** — doc-attribution, Planner Bash removal, no-description
  handling — all fixed.
- **M4/M5** — parked as non-blocking (Workflow-as-pseudocode; a cosmetic
  heading). Recorded in the SDD ledger.

Details: `.superpowers/sdd/2026-07-31-jira-orchestrator/progress.md`.

---

## Live dry-run procedure (run after restart)

**Goal:** carry exactly ONE issue fully through the pipeline and confirm every
hand-off, the browser check, the JIRA transition, and the ADF comment.

1. **Restart** the session so Playwright MCP connects.
2. Invoke `/process-jira-backlog`. Confirm **Step 0 passes** (does not halt).
3. Let Step 1 fetch the To-Do backlog; pick the first issue to trace end to
   end (a non-Feature bug is the shortest path — no Planner).
4. Verify the hand-off chain for that issue:
   - **Developer** returns a `DevResult` with real `filesChanged`.
   - **Reviewer** returns a `ReviewResult`; for any booking/availability/DST
     diff, confirm `bookingDstChecked: true` before approval.
   - **Tester** runs typecheck/lint/vitest/build **and** live-drives the
     Playwright MCP against `npm run dev` for the affected flow; returns a
     `TestResult` with `browser: true` backed by observed evidence.
   - On green+green, **Integrator** commits (no Co-Authored-By), pushes,
     transitions the issue to **In Review** (ID 31), and posts an ADF comment.
5. Confirm in JIRA: the issue is **In Review** and the comment lists branch,
   approach/root-cause, files changed, and test evidence.
6. Record the traced issue key, outcome, branch, and evidence in the Step 4
   report table.

### Acceptance criteria (spec §10)

- [ ] Step 0 detects connected Playwright MCP and proceeds (no halt).
- [ ] One issue traverses Planner?→Developer→Reviewer→Tester→Integrator with
      correct structured hand-offs at each boundary.
- [ ] The Playwright MCP browser check actually executes (not skipped/faked).
- [ ] JIRA transition to In Review lands and the ADF comment is posted.
- [ ] Booking/DST-touching changes are explicitly verified before approval.

---

## Notes

- No browser-test results are fabricated here: the live check is genuinely
  deferred to the post-restart run, per the user-approved Step 0 design.
- If, after restart, Step 0 still reports the tools absent, the `.mcp.json`
  entry or the MCP client wiring needs inspection before the dry run — that
  would be a real finding, not an expected state.
