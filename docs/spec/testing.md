# Testing specification

## Objective

The developer is also a real user of the application. Automated verification must provide confidence without ever mutating personal progress or depending on the live provider.

## Core invariants

1. Tests never load the development `.env` as a fallback.
2. Tests never inherit or accept the personal development `DATABASE_URL`.
3. Database integration and E2E tests own disposable PostgreSQL resources.
4. Destructive test operations run only against harness-owned test resources.
5. Automated tests never access the real LeetCode endpoint.

Missing Docker fails clearly; it never falls back to a personal database or SQLite.

## Test layers

### Unit

Use Jest for pure/near-pure application/domain behavior such as:

- feedback scoring;
- memory transitions;
- cooldown;
- progression/regression/revalidation;
- candidate eligibility/ranking;
- configuration validation;
- calendar/date helpers.

Use injected/fake clock, repositories, providers, logger/telemetry, and configuration.

### Provider integration

Use Jest + Nock against normalized LeetCode provider behavior.

Cover success, Premium filtering, pagination, empty/partial/malformed responses, timeouts/retries, duplicate identities, unsupported mappings, and provider errors.

External network is disabled in automated tests.

A separately invoked manual smoke command may validate live LeetCode feasibility/mapping behavior.

### Database/API integration

Use Testcontainers + real PostgreSQL.

Cover:

- migrations;
- Prisma/repository behavior;
- constraints;
- transaction boundaries;
- attempt idempotency;
- reset behavior;
- catalog/update races that matter to local correctness;
- analytics/calendar queries;
- PostgreSQL-specific timestamp behavior.

Do not substitute SQLite.

Use Supertest for real Express endpoint behavior and generated OpenAPI contract expectations.

### Frontend component/HTTP integration

Use React Testing Library + `user-event` for user-visible component behavior.

Use MSW for frontend HTTP integration:

```text
React -> generated client -> MSW
```

These tests do not start Express/PostgreSQL unless they are explicitly E2E.

### E2E

Use Playwright with:

- isolated browser context;
- test application instance;
- disposable PostgreSQL;
- mocked/fixed provider behavior.

Keep browser E2E focused on critical user journeys rather than exhaustive component permutations.

## Harness lifecycle

The test harness owns its resources:

```text
start disposable PostgreSQL
    ↓
issue isolated test connection identity/configuration
    ↓
run migrations
    ↓
seed minimal fixtures
    ↓
start test API/browser resources as needed
    ↓
run tests
    ↓
drain owned async work
    ↓
destroy exactly the resources created by that run
```

Child processes used for migration/seed/application commands receive sanitized test configuration. They must not silently reload a personal `.env` or ambient development database URL.

The implementation may use a harness descriptor to identify the owned test run/container/database. That is an implementation mechanism, not a product contract.

## Personal database protection

Any path capable of destructive database actions in test mode must validate that it is operating on a harness-owned disposable target before connecting or mutating.

Reset tests target disposable databases only.

## Property/invariant tests

Use fast-check where it provides value for scheduler/state invariants, for example:

- Premium never recommended;
- active queue never exceeds configured size;
- no active duplicate problem;
- in-cooldown problem never selected;
- unavailable problem never selected;
- deterministic canonical input -> deterministic ranking;
- unsupported discovery never proves structural absence;
- reset leaves no user-owned progress records while preserving global data.

Do not require exhaustive source-only replay of every historical scheduler version or candidate pool.

## Timer behavior tests

Timer behavior must verify that:

- clearing a running timer removes its persisted state and releases timer ownership;
- clearing a paused timer removes its persisted state and releases timer ownership;
- after clearing either state, another challenge timer can start immediately;
- clearing a timer does not create an attempt or mutate progress, memory, analytics, or recommendations;
- attempting to start another challenge while a running or paused timer still exists does not silently replace the existing timer.

Critical browser flows include:

- start challenge A -> clear timer -> start challenge B;
- start challenge A -> pause -> clear timer -> start challenge B.

## Browser consistency tests

Cover realistic races without implementing a persistent browser synchronization protocol:

- an older request finishing after a successful mutation cannot overwrite the resulting current view;
- reset clears user-scoped cached/timer/draft state after server success;
- a late completion callback cannot clear a new unrelated timer;
- failed requests remain errors rather than becoming false empty/zero states;
- timer survives reload in the same valid progress generation.

Use request cancellation, query invalidation, mutation identity checks, and isolated browser storage in tests.

## Verification tiers

### Fast development check

`yarn check` runs static/documentation/contract checks and should remain suitable for normal iteration.

### Full gate

`yarn verify` runs the broader repository gate, including the Jest suite, critical E2E, and production builds.

The full gate is expected before proposing completion of a milestone/PR/commit when relevant; it does not need to run after every tiny edit.

## CI minimum

CI should include, as appropriate:

- formatting check;
- lint/boundary checks;
- typecheck;
- generated client drift check;
- unit/provider/database/API/frontend tests;
- production builds;
- critical Chromium E2E.

CI never uses the personal development database or the live LeetCode endpoint.
