# Phase 5 Validation Architecture

> Extracted verbatim from `05-RESEARCH.md` § "Validation Architecture" per checker revision 2026-05-10. This is the canonical phase-level validation map. If RESEARCH.md and this file ever diverge, this file is authoritative for plan execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.x |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `vitest run --pool=forks` |
| Full suite command | `vitest run --pool=forks && vitest run --pool=threads` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-01 | Dual ESM+CJS build produces correct outputs | smoke | `node dist/commonjs/index.js` (CJS smoke) + `node --input-type=module 'import("./dist/esm/index.js")'` | ❌ Wave 1 |
| BUILD-06 | Single-package: no workspace, no packages/* | structural grep | `test -d packages && exit 1 || exit 0` | ❌ Wave 1 |
| BUILD-07 | attw + publint both pass | tool output | `attw --pack . --profile node16 && publint` | ❌ Wave 1 |
| BUILD-08 | Tests pass under both pools | CI job | `pnpm test:forks && pnpm test:threads` | ❌ Wave 1 (scripts) |
| BUILD-09 | Biome lint passes | tool output | `biome check .` | ❌ Wave 2 |
| DI-03 | useContainer recipe in README | manual review | README contains `useContainer({ get: t => Container.get(t) })` | ❌ Wave 3 |
| VAL-02 | README Zod/Valibot/ArkType sections | manual review | README contains three validator subsections | ❌ Wave 3 |
| DOCS-01 | 30-line README example | manual smoke | Copy example to fresh project, run it | ❌ Wave 4 |
| DOCS-02 | Migration guide chapters | manual review | MIGRATION.md exists with 6 chapters | ❌ Wave 3 |
| DOCS-03 | TypeDoc generates docs | tool output | `typedoc && test -d docs` | ❌ Wave 3 |
| DOCS-04 | CHANGELOG + Changesets + provenance | integration | RC publish rehearsal | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `pnpm test:forks` (fastest; catches regressions)
- **Per wave merge:** `pnpm test:forks && pnpm test:threads && pnpm build && attw --pack . --profile node16 && publint`
- **Phase gate:** Full build + both pools + attw + publint green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/build/smoke.test.ts` — CJS + ESM import smoke; covers BUILD-01
- [ ] `scripts/check-single-package.sh` — grep gate for no workspace artifacts; covers BUILD-06

*(Existing test infrastructure covers all Phase 1-4 behavioral requirements; Phase 5 only needs build + publish tooling tests)*
