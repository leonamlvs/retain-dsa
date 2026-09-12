# ADR 008 — Yarn workspaces

Status: **accepted** on 2026-09-12 through approval of the complete application plan.

## Context

The initial scaffold used npm workspaces. Local setup should use one pinned package manager while preserving exact dependency versions, the existing monorepo boundaries and reproducible CI.

## Decision

Use Yarn 4.18.0 through Corepack with the `node-modules` linker and immutable lockfile installs.
Keep exact direct dependency versions and the scoped `deepmerge-ts` resolution required by Prisma.
Install scripts remain enabled because Prisma, SWC and esbuild require them. The package age gate is zero because this repository pins and reviews direct versions instead of accepting ranges.

Replace npm commands and cache configuration with Yarn equivalents. Remove `.npmrc` and `package-lock.json` only after their policies and resolved dependency behavior have been validated.

## Consequences

- Node.js 24.19.x and Corepack are prerequisites.
- Plug'n'Play and a test-runner migration are outside this decision.
- CI uses `yarn install --immutable` and generated files remain drift-checked.

## Documents and verification

Update architecture, development, testing, project structure and CI documentation. Verify a clean immutable install, Prisma generation, generated API client, lint, typecheck, tests and builds.
