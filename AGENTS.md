# AGENTS.md

## Repository goal

Retain DSA is a local-first, single-user web application that guides continuous DSA interview practice using the official LeetCode 75 curriculum, adaptive `Skill + Difficulty` memory, free LeetCode problem discovery, and post-attempt feedback.

## Source-of-truth hierarchy

Use the smallest relevant source set.

1. Executable contracts and configuration are authoritative for their technical shape:
   - API: Zod schemas and generated OpenAPI.
   - Database: Prisma schema and committed migrations.
   - Runtime: `compose.yaml` and application startup code.
   - Dependencies: `package.json` and `yarn.lock`.
   - CI: workflow files.
2. `docs/spec/*` defines current product and engineering behavior.
3. Accepted ADRs explain why important decisions were made. ADRs do not override current specifications.
4. `docs/work/current.md` describes intended work only. It never changes product behavior by itself.
5. `docs/incidents/*` and `docs/archive/*` are historical and non-normative.

If two current canonical sources conflict, stop and report the contradiction. Do not choose a source because it is newer.

## Context loading

Always read:

- `docs/spec/product.md`;
- `docs/work/current.md` when it exists and is relevant to the requested work.

Then read only the relevant domain specification:

- scheduler, memory, discovery, progression, ranking -> `docs/spec/scheduler.md`;
- browser UI, timer, feedback modal, analytics presentation -> `docs/spec/frontend.md`;
- package boundaries, runtime, persistence boundaries, API ownership -> `docs/spec/architecture.md`;
- automated testing or test harness changes -> `docs/spec/testing.md`.

Read an ADR only when a specification or task references it, when rationale is needed, or when reconsidering a decision.

Do not load `docs/archive/*`, closed incidents, superseded ADRs, or unrelated ADRs during normal implementation planning.

## Change discipline

- Specifications describe the current desired state, not change history.
- Never add sections such as “approved amendments”, “later refinements”, or changelogs to canonical specifications. Edit the relevant rule in place.
- A plan, incident report, test failure, or implementation detail cannot silently create product requirements.
- Add an ADR only for a material decision whose rationale should survive the implementation.
- Preserve superseded ADRs as history; supersede them explicitly instead of rewriting their original decision.
- Do not change a specification merely to match existing code. Report mismatches first.

## Architecture guardrails

- Keep `apps/api` and `apps/web` independent.
- The web application talks to the backend only through the generated HTTP/OpenAPI client.
- Domain rules must not depend on Express, Prisma, PostgreSQL, Pino, React, Swagger, or LeetCode transport details.
- External provider calls and database access belong in infrastructure adapters.
- Controllers contain no business logic.
- Do not introduce microservices, Redis, Kafka, authentication, multiple providers, AI tutoring, or code execution in the MVP.

## Testing and user-data safety

- Automated tests must never access the personal development database.
- Database integration and E2E tests own disposable PostgreSQL resources.
- Tests must not inherit the development `.env` or `DATABASE_URL`.
- Automated tests must not call the real LeetCode endpoint. Use the explicit manual smoke command for live provider checks.
- Business logic must be testable without UI, real network, real clock, or personal data.

## Git and commits

- Use short-lived branches; do not commit directly to `main`.
- Use Conventional Commits.
- Keep commits logically cohesive; implementation and its tests normally belong together.
- Before every commit, present the changed files, checks/tests run, their results, and the proposed commit message.
- Commit only after explicit user approval.
