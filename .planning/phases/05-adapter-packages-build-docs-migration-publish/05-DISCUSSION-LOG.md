# Phase 5 Discussion Log

**Date:** 2026-05-10
**Mode:** discuss (default)

## Gray Areas Presented

1. TypeDI adapter shape
2. Package name + initial release
3. README + migration guide
4. Release automation + CI matrix

User selected all four.

## Questions and Selections

### Q1 — TypeDI integration shape (DI-03)
**Options presented:**
- Sub-path export `<lib>/adapters/typedi` (Recommended)
- Docs-only TypeDI example
- Separate sibling repo / package

**User selected:** Docs-only TypeDI example.
**Why this matters:** DI-03 reframes from "published adapter package" to "documented `useContainer` recipe." Removes a sub-path export from tshy config and a sibling-package surface entirely. ROADMAP/REQUIREMENTS wording for DI-03 + SC #4 needs a doc rewrite in plan-1.

### Q2 — npm package name
**Options presented:**
- `express-controllers` (unscoped)
- `@nirajk/express-controllers` (scoped)
- Branded alternative
- Defer to publish time

**User selected:** `express-controllers` (unscoped).
**Note:** Planner verifies availability with `npm view express-controllers`; fallback `@nirajk/express-controllers` if taken.

### Q3 — Initial release strategy
**Options presented:**
- Pre-release ladder 1.0.0-rc.1 → 1.0.0 (Recommended)
- Direct 1.0.0
- 0.x prerelease, then 1.0.0 later

**User selected:** Pre-release ladder.
**Why:** Exercise the full publish pipeline (tshy / attw / publint / provenance / fresh-install smoke) before locking semver.

### Q4 — README opening example shape (DOCS-01)
**Options presented:**
- CRUD `@JsonController` with one validated POST (Recommended)
- Hello-world `@Get('/')` only
- Validation-heavy single route

**User selected:** CRUD `@JsonController` (Recommended).

### Q5 — Migration guide depth (DOCS-02)
**Options presented:**
- Lean opinionated guide (Recommended)
- Comprehensive cookbook
- Migration table + recipes section

**User selected:** Lean opinionated guide (Recommended).
**Lead chapter:** parameter-decorator → method-level input declaration.

### Q6 — CI matrix scope
**Options presented:**
- Node 20/22/24 × Linux only (Recommended)
- Full OS matrix (Linux + macOS + Windows)
- Linux + Windows

**User selected:** Linux only.
**Rationale:** Pure-JS dependencies; OSS minutes matter; add OS cells reactively if a real bug surfaces.

### Q7 — Publish trigger + TypeDoc hosting
**Options presented:**
- Changesets PR → manual approve → auto-publish + GitHub Pages TypeDoc (Recommended)
- Tag-triggered + TypeDoc bundled in tarball
- Manual publish + README-only API docs

**User selected:** Changesets + GitHub Pages (Recommended).

### Q8 — Loose ends: pnpm migration + Express matrix
**Options presented (multi-question):**
- Dev pm: Migrate to pnpm 10 / Stay on npm
- Express matrix: 5.2.x only / 5.1 × 5.2 matrix

**User selected:** Migrate to pnpm 10 + Test 5.2.x only.

## Scope Creep / Deferred Ideas Captured

- Separate TypeDI npm package — moved to `<deferred>`; reconsider only on real user demand.
- class-validator legacy adapter — PROJECT.md v1.x deferral honored.
- Documentation site (VitePress/Starlight/Vite) — README + TypeDoc HTML sufficient for v1.
- Codemods — explicit project-wide out-of-scope.
- OS matrix beyond Linux — reactive add only.
- Express 5.1.x cell — reactive add only.
- CODE_OF_CONDUCT / SECURITY / issue+PR templates — v1.x unless trivial.
- Bundler smoke matrix beyond a single Vite sanity check — planner discretion.

## Claude's Discretion

Planner-owned sub-decisions:
- Plan ordering / wave count.
- Exact tshy config (entries, dialects, sub-path exports = `.` only).
- Biome 2 baseline rule set.
- attw config + ignore list for known false positives.
- TypeDoc theme + entry-point selection.
- GitHub Actions workflow file count / consolidation.
- Provenance OIDC permissions block.
- CHANGELOG.md `1.0.0-rc.1` entry seed.
- README badge set.
- Changesets `pre enter rc` decision.
- Migration guide file location (root vs `docs/`).
- Repo URL / GitHub username — confirm with user during execution.

## Reconciliation Notes for Planner

- ROADMAP.md Phase 5 SC #1: monorepo wording superseded → single-package wording.
- ROADMAP.md Phase 5 SC #4: separate adapter package wording superseded → docs-only recipe.
- ROADMAP.md Phase 5 "Plans" subsection: currently a copy of Phase 4 filenames; overwrite.
- REQUIREMENTS.md DI-03: reword from "published adapter package" to "documented adapter recipe."
- These rewrites are part of plan-1 of this phase.
