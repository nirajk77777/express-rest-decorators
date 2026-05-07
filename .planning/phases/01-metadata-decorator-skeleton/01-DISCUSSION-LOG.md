# Phase 1: Metadata & Decorator Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 1-Metadata & Decorator Skeleton
**Areas discussed:** Stale-spec reconciliation, Metadata storage strategy (with controller-inheritance follow-up)

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Stale-spec reconciliation | REQUIREMENTS.md BUILD-04/05/06 + STATE.md "Key Decisions Locked-In" still describe the old (Stage 3 / no reflect-metadata / monorepo) direction; ROADMAP + CLAUDE.md follow the override. | ✓ |
| Metadata storage strategy | Pure reflect-metadata keys vs hybrid WeakMap + reflect-metadata vs MetadataArgsStorage (rc-style). | ✓ |
| src/ folder layout | Flat vs grouped-by-concern vs routing-controllers mirror. | |
| HttpError API shape | Constructor signature, toJSON shape, cause chaining, stack-trace policy. | |

**User's choice:** Stale-spec reconciliation + Metadata storage strategy. The other two were explicitly deferred to Claude/planner discretion.

---

## Stale-spec reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite stale docs now | Edit REQUIREMENTS.md BUILD-04/05/06 + STATE.md "Key Decisions Locked-In" so they match CLAUDE.md and ROADMAP. Cleanest. | ✓ |
| Override banner + leave text | Prepend an OVERRIDE admonition; preserve original wording. | |
| Trust ROADMAP+CLAUDE only | Don't touch the stale files; rely on CONTEXT.md to warn agents. | |
| Update REQ-IDs only, keep STATE | Targeted minimum: only rewrite BUILD-04/05/06; leave STATE.md narrative alone. | |

**User's choice:** Rewrite stale docs now.
**Notes:** Followed up to confirm timing — chose "Before planning, separate commit" over "First plan inside Phase 1" or "Inline during planner". Doc rewrite happens as its own commit before `/gsd-plan-phase 1`.

---

## Metadata storage strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: WeakMap + reflect-metadata | Module-private WeakMaps for library tree state; reflect-metadata only for TS-emitted type metadata (`design:paramtypes`, `design:returntype`). Bounded keys, no collisions, multi-import safe. | ✓ |
| Pure reflect-metadata keys | Use Reflect.defineMetadata for everything; Symbol-keyed namespace. Simpler mental model; easy inheritance via prototype-chain walk. | |
| MetadataArgsStorage (rc-style) | Module-level singleton with flat arrays per decorator kind. Matches routing-controllers but a known dual-package-hazard footgun. | |

**User's choice:** Hybrid: WeakMap + reflect-metadata (with the preview code sketch confirmed).
**Notes:** Code preview confirmed the WeakMap shape: `WeakMap<Function, ControllerMeta>` for class-level state, `WeakMap<object, Map<string|symbol, MethodMeta>>` for method-level. Decorators read TS types via `Reflect.getMetadata('design:paramtypes', proto, key)` — that's the only reflect-metadata usage in the decorator layer.

### Follow-up: controller inheritance

The user asked "what is controller inheritance?" mid-discussion. Reframed with a concrete `extends` example (base controller with `@Get('/health')` inherited by a subclass), then re-asked the question.

| Option | Description | Selected |
|--------|-------------|----------|
| MetadataBuilder walks prototype chain | Decorators only write to immediate proto; builder walks `Object.getPrototypeOf` and merges top-down with subclass-wins-on-collision. | ✓ |
| Decorators copy parent meta at registration | Each decorator looks up the chain and copies parent meta down. Order-dependent and fragile. | |
| Defer inheritance support to Phase 2 | Phase 1 stores per-class only; inheritance walk lands in Phase 2. Conflicts with Phase 1 SC #1 ("fully-resolved metadata tree"). | |

**User's choice:** MetadataBuilder walks the prototype chain.
**Notes:** Decorators stay pure registrars (no chain walking at registration time); inheritance logic centralized in `MetadataBuilder.build()`.

---

## Claude's Discretion

The user explicitly chose "I'm ready for context" instead of discussing these — they're delegated to research + planner judgment, anchored to ROADMAP Phase 1 success criteria:

- HttpError API surface (constructor signatures, `toJSON()` shape, `cause` chaining, `details`/`source` fields, stack policy)
- `src/` folder layout (flat vs grouped-by-concern vs routing-controllers mirror)
- Runtime mode guard (detection strategy + error-message wording)
- Public exports surface beyond the items mandated by ROADMAP Phase 1 SC #5
- Phase 1 handling of the optional method-level input declaration (recorded as opaque per CONTEXT.md D-04 ff.; planner refines if needed)

## Deferred Ideas

- `@scope/express-controllers-typedi` adapter package — Phase 5 (DI-03).
- Class-validator legacy adapter — technically unblocked by the override but staying Out of Scope for v1 per existing scope decision; the rationale text is itself stale and folded into the D-02 doc rewrite.
- Auto-injection by constructor type via `design:paramtypes` — technically possible now that `reflect-metadata` is in core; project policy keeps DI strictly pluggable, no auto-injection.
