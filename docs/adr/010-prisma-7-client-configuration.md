# ADR 010: Prisma 7 Client Configuration

- Status: Accepted
- Date: 2026-09-12

## Context

The API uses PostgreSQL through Prisma, with a committed SQL migration and disposable PostgreSQL integration tests. Prisma 7 removes the datasource URL from the Prisma schema and requires an explicit generated client and PostgreSQL driver adapter. The repository is a Yarn monorepo whose Prisma CLI runs from the workspace root, while the API owns the runtime database code.

## Decision

- Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to the same Prisma 7 release.
- Keep the datasource provider in `apps/api/prisma/schema.prisma`, but configure the URL, schema path and migration path in the root `prisma.config.ts`.
- Generate the client into `apps/api/src/generated/prisma` with Prisma's `prisma-client` generator.
- Create Prisma clients through the API infrastructure factory using `PrismaPg` and an explicit connection string.
- Use the same factory for production and disposable test databases; tests continue to validate and supply their own Testcontainers connection URL.
- Keep the existing SQL migration unchanged. Prisma upgrades must not reset or recreate the local development database.
- Do not require a `.env` file for client generation. Docker supplies `DATABASE_URL` for migration deployment and runtime startup.

## Consequences

The API imports generated Prisma types from its source tree instead of `@prisma/client`. PostgreSQL pool behavior is now controlled by the `pg` driver adapter, so connection-pool settings can be made explicit in the infrastructure factory if deployment requirements change. Generated client files are build inputs and must be refreshed with `yarn generate:db`, never edited manually.

## Verification

Prisma validation and generation must pass without a `.env`; migration deployment must pass against a disposable PostgreSQL database; unit, integration, build and Docker startup checks must remain green.
