# ADR 004 — OpenAPI is the frontend/backend contract

## Context

Frontend and backend must remain clearly separated and strongly typed.

## Decision

API Zod schemas generate OpenAPI.
Swagger UI serves interactive docs.
Frontend client/types are generated from OpenAPI.

## Consequences

- No importing backend domain models into React.
- API contract changes are visible in typecheck/CI.
- Reduced DTO/documentation duplication.
