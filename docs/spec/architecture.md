# Architecture specification

## Style

- TypeScript monorepo.
- Modular monolith backend.
- Independent React frontend.
- REST/OpenAPI boundary.
- PostgreSQL persistence.
- Local-first Docker runtime.

Primary repository boundaries:

```text
apps/api        Express application, domain/application modules, infrastructure
apps/web        React/Vite browser client
packages/api-client   generated OpenAPI TypeScript client
tests           cross-cutting integration/E2E/support where not colocated
config          validated configuration inputs/examples
scripts         generation, checks, controlled operational tooling
```

## Dependency direction

```text
HTTP controller
    ↓
application service/coordinator
    ↓
domain engines
    ↓
repository/provider ports
    ↑
infrastructure adapters
```

Domain/application rules must not depend on Express, Prisma, PostgreSQL, Swagger, Pino, React, or LeetCode GraphQL details.

The web application depends on backend behavior only through the generated HTTP client.

## API ownership

HTTP runtime schemas are written with Zod. OpenAPI is generated from those schemas and is the detailed frontend/backend contract. Swagger/OpenAPI output is generated documentation, not a separately maintained Markdown API specification.

Business endpoints live under `/api/v1`; infrastructure endpoints such as `/health`, `/docs`, and `/openapi.json` may remain unversioned.

API mutations use stable application error codes and idempotency where retry safety requires it. Progress generation is a reset/idempotency boundary, not a general browser synchronization watermark.

## Persistence ownership

Prisma schema plus committed migrations are the detailed database contract. Markdown documentation describes only persistence invariants that are not obvious from the executable schema.

Global/provider-owned data includes concepts such as:

- problem catalog/metadata;
- tags and skill taxonomy;
- curriculum definitions/items;
- discovery metadata/cache.

User-owned data includes concepts such as:

- attempts and feedback;
- memory and exact-problem state;
- recommendations/issuance lifecycle as required to record work safely;
- user-specific progress/reset state;
- durable user-specific refill work when required.

Progress reset removes user-owned data and preserves global data.

## Historical source versus operational projections

Attempts and raw feedback are durable historical facts. Operational memory, cooldown, queue, and analytics projections should be reconstructable from retained facts where practical.

The MVP does **not** require full event-sourced replay of every historical candidate pool, millisecond evaluation cutoff, catalog revision, or prior scheduler algorithm solely to reproduce an old ranking decision. Do not keep multiple scheduler implementations for historical replay.

Reconstruction exists to restore useful current state and verify core invariants, not to create a general audit/event-sourcing platform.

## Concurrency and transactions

The application is local and single-user, but asynchronous provider work and overlapping requests can still race.

Use straightforward database transactions/locking where atomicity is required, especially for:

- saving an attempt and related user-state mutation;
- progress reset;
- accepting catalog metadata that invalidates active recommendations;
- publishing queue changes after asynchronous discovery.

Provider HTTP always runs outside database transactions. Stale provider results must not overwrite newer accepted metadata.

Avoid distributed-consensus patterns, browser-wide revision protocols, or other synchronization machinery disproportionate to the single-user local scope.

## Runtime composition

Yarn workspaces are managed through Corepack with the repository-pinned Yarn release.

`yarn dev` starts Docker Compose. Compose runs:

- the application;
- PostgreSQL on a private Compose network with persistent named storage.

Only the application origin is published to the host by default. PostgreSQL is not published.

Express owns the application HTTP listener. Development may attach Vite middleware/HMR to that origin; production serves compiled web assets from the same origin.

Startup may apply committed non-destructive migrations and seed only missing required roots. Startup must never reset or recreate the personal development database.

## Configuration

Configuration must be validated centrally and injected into business logic. Do not scatter unexplained runtime constants through scheduler/application services.

Secret or personal environment values are never committed.

## Observability

Use structured Pino logs with request/operation correlation where useful.

Operational logging should answer basic questions such as:

- did curriculum sync/discovery fail?;
- why was a recommendation created/replaced?;
- did an attempt/reset commit?;
- is PostgreSQL healthy?;
- is provider access degraded while cached operation remains possible?

Do not log credentials, cookies/authorization headers, personal database URLs, raw feedback bodies, or unbounded provider responses.

`GET /health` reports PostgreSQL failure as unhealthy. Provider-only failure may report degraded capability when cached operation can continue.

No external Prometheus/Grafana/Tempo/Loki/OpenTelemetry stack is required for the MVP.

## Generated code

Generated API client and Prisma client output are build inputs and must not be edited manually.

## Scope guardrails

Do not introduce, for the MVP:

- microservices;
- Redis/Kafka;
- multiple providers;
- authentication;
- distributed locks/consensus;
- generalized event sourcing;
- production deployment infrastructure.
