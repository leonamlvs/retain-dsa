# Contributing

## Supported local workflow

The supported local application runtime is Docker Compose. PostgreSQL stays private to the Compose network and only the application origin is published.

```sh
corepack enable
yarn install --immutable
yarn dev
```

Open `http://localhost:3000`.

## Commands to remember

Use the small set of top-level commands below for normal work:

```sh
yarn dev       # run the local application stack
yarn format    # apply formatting
yarn check     # fast static/documentation checks
yarn test      # Jest projects
yarn verify    # full local verification gate
```

`yarn check` should remain fast enough for normal iteration. `yarn verify` is the broader gate before a proposed commit, PR, or milestone completion and includes E2E/build checks.

Specialized commands may exist under clear namespaces such as `test:*`, `generate:*`, `db:*`, `docs:*`, `config:*`, and `smoke:*`.

## Generated contracts

- Zod HTTP schemas are the runtime API source.
- OpenAPI is generated from those schemas.
- The frontend client is generated from OpenAPI and must not be edited manually.
- Prisma schema plus committed migrations are the database contract.
- Generated Prisma client files must not be edited manually.

Regenerate only the contract that changed.

## Tests

Automated tests never use the personal development database or the live LeetCode endpoint.

- Unit tests: pure or near-pure application/domain behavior.
- Provider tests: mocked LeetCode HTTP with Nock.
- Database/API integration: disposable PostgreSQL.
- Frontend HTTP integration: MSW.
- E2E: isolated browser context plus disposable application/database resources.
- Live LeetCode access: explicit manual smoke command only.

See `docs/spec/testing.md` for the canonical strategy.

## Git workflow

Use lightweight GitHub Flow:

- stable `main`;
- short-lived `feat/*`, `fix/*`, `refactor/*`, `test/*`, `docs/*`, or `chore/*` branches;
- CI green before merge;
- Conventional Commits.

Examples:

```text
feat(scheduler): add retention-based recommendations
fix(timer): preserve elapsed time after refresh
test(discovery): cover incomplete provider scans
docs(frontend): clarify challenge interaction states
```

Before a commit is created, report:

1. files/hunks included;
2. checks/tests run;
3. actual results;
4. proposed Conventional Commit message.

Create the commit only after explicit user approval.

## Documentation changes

Do not update documentation merely because code changed.

Update a canonical specification when the expected behavior or engineering contract changes. Add an ADR only when a material decision needs durable rationale. Bugs, investigations, and implementation progress belong in tasks/incidents/work planning rather than canonical specifications.
