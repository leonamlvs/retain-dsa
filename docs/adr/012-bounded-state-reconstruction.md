# ADR 012 — Bounded state reconstruction instead of full historical replay

Status: **Accepted**.
Supersedes: replay/versioning portions of ADR 006.

## Context

The original reproducibility design expanded into retaining complete historical catalog/configuration/mapping versions, candidate pools, millisecond evaluation cutoffs, lifecycle decision inputs, and multiple scheduler algorithm versions so old ranking decisions could be reproduced exactly.

That complexity is disproportionate to a local single-user DSA study MVP and increases persistence, testing, planning, and documentation cost without materially improving the user's study workflow.

## Decision

Retain durable facts necessary for current product behavior and safe recovery, especially attempts/raw feedback, stable issuance facts required to record already-performed work, current/global catalog data, and user progress/reset boundaries.

Operational memory, cooldown, queue, and analytics should be rebuildable from retained facts where practical, but the MVP does not require a generalized event-sourcing/audit engine.

Specifically, do not require:

- multiple historical scheduler implementations (`v3`, `v4`, etc.) solely for replay;
- complete historical candidate-pool capture solely to reproduce an old ranking;
- millisecond source-cutoff replay across every historical catalog/configuration state;
- deterministic reconstruction of every prior recommendation decision from archived engine inputs.

Use one current scheduler policy.

## Consequences

- Core historical practice data remains durable.
- Reset/recovery/testing can still rebuild useful current projections and verify important invariants.
- Persistence and property tests become materially smaller.
- Exact historical ranking reproducibility is intentionally not an MVP guarantee.
