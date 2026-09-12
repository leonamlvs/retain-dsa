# ADR 001 — Modular monolith backend and monorepo

## Context

The MVP is local, single-user, and must remain understandable/testable without operational overhead.

## Decision

Use one repository with independent `apps/api` and `apps/web`.
The backend is a modular monolith.
Frontend communicates with backend only via REST/OpenAPI.

## Consequences

- No microservices/Kafka/Redis required.
- Clear frontend/backend boundary.
- Future mobile client can consume the same API.
- Domain remains testable without transport/infrastructure dependencies.
