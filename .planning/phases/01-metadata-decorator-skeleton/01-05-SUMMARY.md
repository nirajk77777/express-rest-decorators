---
phase: 01-metadata-decorator-skeleton
plan: "05"
subsystem: container
tags: [ioc, di, container, weakmap, pluggable]
dependency_graph:
  requires: [01-02]
  provides: [IocAdapter, DefaultContainer, useContainer, getContainer, resetContainer]
  affects: []
tech_stack:
  added: []
  patterns: [WeakMap-cached lazy-new, module-level container singleton, pluggable IoC adapter]
key_files:
  created:
    - src/container/ioc-adapter.ts
    - src/container/default-container.ts
    - src/container/use-container.ts
    - src/container/index.ts
    - tests/container/default-container.test.ts
    - tests/container/use-container.test.ts
  modified: []
decisions:
  - "IocAdapter.get<T>(cls, action?) returns T | Promise<T> — allows async container adapters (e.g. async factories) without breaking sync consumers"
  - "DefaultContainer uses WeakMap<ClassConstructor<unknown>, unknown> for per-class singleton caching — avoids Map key collision by using the constructor reference directly"
  - "resetContainer() restores to the module-level defaultContainer constant (not a fresh new DefaultContainer()) — ensures singleton identity is preserved across test teardowns"
  - "Zero DI library imports enforced — grep gate confirms no tsyringe/typedi/awilix/inversify imports in src/"
metrics:
  duration: "69s"
  completed_date: "2026-05-08"
  tasks_completed: 1
  files_created: 6
  files_modified: 0
---

# Phase 01 Plan 05: Container / IoC Adapter Summary

Pluggable IoC adapter contract with WeakMap-cached default container: `IocAdapter` interface, `useContainer()` / `getContainer()` / `resetContainer()` module-level hooks, zero DI library dependencies in core.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Failing tests for IocAdapter + DefaultContainer + useContainer | 2bf5d74 | tests/container/default-container.test.ts, tests/container/use-container.test.ts |
| GREEN | Implement IocAdapter + DefaultContainer + useContainer | ea6ef3e | src/container/ioc-adapter.ts, src/container/default-container.ts, src/container/use-container.ts, src/container/index.ts |

## Verification Results

- `tsc --noEmit`: exits 0 (clean)
- `vitest run tests/container/`: 9/9 tests pass (D1-D4 + U1-U5)
- `grep -rE "from ['\"](tsyringe|typedi|awilix|inversify...)['\"]" src/`: 0 hits (ROADMAP SC #4 satisfied)
- `grep -c "WeakMap" src/container/default-container.ts`: 1
- 5 named exports confirmed: IocAdapter, DefaultContainer, useContainer, getContainer, resetContainer
- No Express imports in container module

## TDD Gate Compliance

- RED gate: `test(01-05)` commit 2bf5d74 — 2 failing test files created before implementation
- GREEN gate: `feat(01-05)` commit ea6ef3e — all 9 tests pass after implementation
- REFACTOR gate: not needed (clean implementation on first pass)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. The container module has no network endpoints, no file access, and no trust boundaries — it is a pure in-memory module-level registry.

## Self-Check: PASSED

- src/container/ioc-adapter.ts: FOUND
- src/container/default-container.ts: FOUND
- src/container/use-container.ts: FOUND
- src/container/index.ts: FOUND
- tests/container/default-container.test.ts: FOUND
- tests/container/use-container.test.ts: FOUND
- Commit 2bf5d74: FOUND (RED gate)
- Commit ea6ef3e: FOUND (GREEN gate)
