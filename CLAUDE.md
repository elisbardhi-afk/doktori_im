# Claude Code Guidelines for Doktori Im

## Branching Strategy

**For every big change I ask you to do, create a new branch.** This way changes are isolated and can be reviewed or reverted easily if needed.

### Process
1. When given a substantial feature, bugfix, or refactor, create a new branch from `main`
2. Make all changes on that branch
3. Push the branch to GitHub
4. Once verified, merge back to `main` (via PR or direct merge)

### What counts as "big"
- Feature additions (new pages, components, functionality)
- Bugfixes affecting core systems (booking, auth, availability)
- Database migrations or schema changes
- Refactors affecting multiple files
- Performance improvements with measurable impact

### Small changes OK on main
- Typo fixes, comment updates
- Single-file tweaks
- Minor UI polish with no behavioral impact

---

## Commit Style

- **No Co-Authored-By attribution** — commits are authored by the user, not Claude
- Clear, concise commit messages focusing on the "why"
- Format: `type: short description` (e.g., `Fix: include slot_duration_minutes in availability_rules seed`)

---

## Project Context

**Doktori Im** — DoctoLib-style medical booking webapp for Albania (Next.js + Supabase).  
**Critical requirement:** Flawless booking — no double-booking, correct DST handling, all slots bookable.

See [project memory](../.claude/projects/c--Users-ebardhi-Downloads-claude-demo-projects-doktori-im/memory/doktori-im-project.md) for full details.
