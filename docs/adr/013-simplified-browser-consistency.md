# ADR 013 — Simplified browser consistency model

Status: **Accepted**.
Supersedes: ADR 011 and browser-fence portions of ADR 006.

## Context

The previous browser consistency model used a persistent state-revision watermark plus request epochs to reject older responses. In a local single-user application, that mechanism could turn stale browser metadata into a lockout that hid valid server recommendations and required extensive recovery logic.

## Decision

Do not use a persistent browser revision watermark or a general request-epoch fencing protocol.

Use normal application mechanisms:

- TanStack Query request cancellation;
- cache invalidation/refetch after successful mutations;
- query-key scoping only for state that truly depends on progress generation/timezone/range;
- explicit browser cleanup after successful reset;
- mutation callbacks that verify the timer/draft/issuance identity they intend to modify;
- progress generation only where the server needs a reset/idempotency boundary.

A response that fails is an error; it must not be reinterpreted as an empty queue or zero activity.

## Consequences

- The frontend has fewer synchronization states and fewer persistent failure modes.
- Reset and late-response tests remain necessary, but they verify user-visible correctness rather than a custom consistency protocol.
- API/session endpoints that existed only to support revision watermark recovery are no longer required unless another independently justified contract needs them.
