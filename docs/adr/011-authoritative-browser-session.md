# ADR 011 — Authoritative browser session recovery

Status: accepted on 2026-09-12 through approval of the queue repair plan.

Lifecycle: **Superseded by ADR 013.** Retained for historical rationale only.

## Decision

Expose read-only `GET /api/v1/session`, returning the persistent local user root ID as `databaseId`, progress generation and global state revision from one repeatable-read snapshot. Reset preserves database identity and changes progress generation. All study responses are `Cache-Control: no-store`.

Bootstrap and explicit reconciliation may replace an obsolete browser watermark, including a lower revision after database restore. Only the latest newly issued session request may do this. Each reconnection or reset advances a browser request epoch; older callbacks are rejected before changing watermarks, caches, timers or drafts. Ordinary data responses cannot switch generations. They retry once through a fresh session handshake, and expose a retry action if recovery fails.

Browser storage is advisory, not proof of current server state. A blocked storage API does not block read-only use. Timers survive bootstrap when their generation and issuance remain valid. New database or generation query scopes prevent reuse of another database's cached cards.

## Verification

RTL/MSW covers ahead watermarks and epoch rejection. The disposable Chromium flow begins with an obsolete watermark and reloads an active timer. Supertest verifies uncached session snapshot headers.
