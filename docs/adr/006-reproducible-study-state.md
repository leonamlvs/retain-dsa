# ADR 006 — Reproducible study state and approved policy amendments

Status: accepted through the user's explicit approval of the revised execution plan. Commit approval remains separate.

Lifecycle: **Partially superseded by ADR 012 and ADR 013.** This historical record is non-normative where those later decisions apply; current behavior is defined by `docs/spec/*`.

## Decisions

- Every saved attempt counts as completion/activity/eligible-anchor coverage, including failure. Coverage counts distinct active/free/available official anchors; zero denominator is unavailable.
- Scoring uses fixed-point weighted raw values and continuous .40/.60/.85 thresholds. Preserve raw answers/score/cap/rating/versions. FAILED, FULL_SOLUTION, or implementation UNABLE caps at AGAIN; substantial help at HARD; hint at GOOD. Strongest cap wins.
- Structural supply excludes paid/unavailable metadata, not personal cooldown/active state. Fresh complete scans authorize one-positive progression for one candidate or skipping zero-candidate tiers. Never infer scarcity from partial scans/errors. Retain certificate provenance; no cross-difficulty memory transfer.
- Derive regression boundaries from historical review instants, pinned memory parameters and config activations, never from job observations. Historical eligibility survives forgetting; one fresh healthy lower positive after the boundary permits advanced revalidation. All lower tiers structurally absent permits same admitted-tier revalidation.
- Immutable issuances remain recordable once until reset after replacement/metadata/availability changes. Use original primary skill/difficulty; invalidate current same-problem cards when a late save establishes cooldown.
- Save history/memory/cooldown/lifecycle/source sequence/durable refill atomically. Refill discovers below minimum before ranking. HTTP never runs under the database lock; provider failure never reverses committed completion.
- All runtime writes share one application-state row-lock transaction port. Capture/validate catalog/state/config/generation revisions, discard stale fetched batches. Catalog acceptance and affected-card invalidation commit together. Read responses align data and generation/revision in one snapshot.
- Validate generation then idempotency before new-save lifecycle. Replay original facts without extra memory/refill. Capture time after lock acquisition; tie by source sequence; reject backward business time.
- Harness-issued descriptors guard migrations/seed/app/child/reset/rebuild/cleanup before connection. Never inherit personal DATABASE_URL/.env. Missing Docker fails without fallback.
- Separate metadata freshness refresh from pool refill. Fingerprint query/mapping/filter/order/pagination, retain complete scan proof. Initial injected limits: pool10/25, page50, five pages, 5s request, one transient retry, 15s need, 30s total, 1d certificate, 7d metadata, 5min durable retry.
- User-response generation/revision fences prevent stale cache/timer/draft changes across reset and tabs. Timer cancel includes modal elapsed time; save clears only the matching timer. Retired issuance recovery survives refresh.
- Immutable source includes attempts, issuances/lifecycle, normalized catalog/curriculum/mapping revisions, discovery proof, full config/activation/adapter versions and decision inputs. Replay recomputes scoring/memory/cooldown/eligibility/ranking/analytics at explicit time/cutoff offline. Missing versions fail. Reset deletes all user-owned source/projections/work, preserving global history and the new empty generation.

## Consequences

Current memory, cooldown, eligibility, catalog, queue and analytics are reconstructable projections. Reading stored outputs is not proof of replay. Provider/memory contracts precede schema, calendar precedes completion, and isolated browser harness precedes E2E. All F1–F11 acceptance tests and milestone dependencies were recorded in the historical approved plan. Numeric defaults remain adjustable tuning assumptions, not scientific claims.
