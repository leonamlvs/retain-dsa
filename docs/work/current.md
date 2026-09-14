# Current work — documentation consolidation and MVP recovery

Status: **Complete**. This file describes completed work and does not override `docs/spec/*`.

## Goal

Bring the repository back to a small, coherent spec-driven-development model, then finish the MVP against the canonical specifications without reintroducing superseded replay/browser-fencing complexity.

## W1 — Documentation/governance consolidation

Acceptance:

- canonical behavior exists only in `docs/spec/*` and executable contracts;
- obsolete `api.md`, `database.md`, `observability.md`, `git-workflow.md`, `development.md`, `project-structure.md`, implementation/recovery/status plans are removed from the canonical document set and archived only when historical value remains;
- ADR index accurately marks current/superseded decisions;
- canonical specs contain no “approved amendments/refinements” appendices;
- `AGENTS.md` uses contextual routing instead of “read everything”;
- `docs:check` validates mechanical structure/links/statuses rather than pretending to prove semantic completion.

## W2 — Script/workflow cleanup

Acceptance:

- a small top-level command set exists: `dev`, `format`, `check`, `test`, `verify`;
- specialized commands remain discoverable under consistent namespaces;
- `check` is suitable for normal iteration;
- `verify` is the complete local gate and is not required after every tiny edit;
- Docker Compose remains the supported daily runtime;
- personal DB/provider safety is preserved.

## W3 — Reliable queue and browser flow

Acceptance:

- valid persisted recommendations are not hidden by stale local revision metadata;
- no persistent revision watermark/epoch protocol remains;
- loading/error/shortage/ready states are distinct;
- completion refills the queue without provider failure undoing the saved attempt;
- timer starts, pauses/resumes, survives reload, can be explicitly cleared from either running or paused state, releases ownership so another challenge can start, and follows the frontend save/cancel semantics.

## W4 — Discovery and scheduler completion

Acceptance:

- supported provider mappings discover only free/available matching candidates;
- unsupported mapping remains `UNKNOWN`, never false empty supply;
- Intervals official-anchor entry exception behaves as specified;
- earned admissions survive normal forgetting according to current rules;
- only one current scheduler policy exists;
- deterministic ranking and core invariants pass focused unit/property tests.

## W5 — Analytics, reset, runtime and final acceptance

Acceptance:

- required analytics and stored-local-date heatmap behavior pass integration/browser acceptance;
- reset clears all user-owned state while preserving global data;
- Docker runtime starts/restarts with private PostgreSQL and persistent personal data;
- `yarn verify` passes from a clean supported environment;
- commits are proposed as cohesive Conventional Commits and created only after explicit approval.

## Work discipline

For each work item:

1. read only the relevant canonical spec(s);
2. identify the smallest cohesive implementation slice;
3. implement code + focused tests;
4. run relevant fast checks during iteration;
5. run the appropriate broader gate before claiming acceptance;
6. update a specification only when desired behavior changed, not to narrate implementation progress;
7. propose a cohesive commit and wait for explicit approval.

## Verification

Verification on 2026-09-13:

- `yarn check` passed, including documentation structure, formatting, boundaries, typechecking, and generated-client drift;
- `yarn verify` passed with 95 Jest tests, 6 critical Chromium E2E tests, and both production builds;
- an isolated Compose project started through `yarn dev`, applied migrations, returned healthy API/UI responses, kept PostgreSQL private, and preserved its progress generation across an app restart;
- only the disposable verification project, network, containers, and volumes were removed afterward.
