# Documentation map

Retain DSA documentation is intentionally split by responsibility.

## Canonical specifications

These describe the current desired state and are normative:

- [`spec/product.md`](spec/product.md) — product behavior, scope, user-facing invariants and MVP acceptance.
- [`spec/scheduler.md`](spec/scheduler.md) — feedback scoring, memory, difficulty progression, discovery, ranking and recommendation rules.
- [`spec/frontend.md`](spec/frontend.md) — routes, interaction behavior, timer/modal semantics, visual direction and accessibility.
- [`spec/architecture.md`](spec/architecture.md) — package boundaries, runtime composition, persistence/API ownership and operational constraints.
- [`spec/testing.md`](spec/testing.md) — testing layers, isolation, harness invariants and verification strategy.

Detailed API shape is owned by Zod/OpenAPI. Detailed database shape is owned by Prisma and migrations.

## Decisions

[`adr/`](adr/) contains architectural/product decision records. ADRs preserve rationale and consequences; they do not replace canonical specifications. Use [`adr/README.md`](adr/README.md) as the index and status map.

## Current work

[`work/current.md`](work/current.md) is the only current repository work plan. It may describe pending work and acceptance targets, but it cannot create product behavior that is absent from the specifications.

## Historical material

- [`incidents/`](incidents/) records operational investigations and their outcomes.
- [`archive/`](archive/) contains obsolete plans/status documents retained only when historical context is useful.

Historical material is non-normative and should not be loaded by default during implementation planning.
