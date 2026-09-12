# Incident — queue hidden by browser revision state

Date: 2026-09-12
Status: Closed as a design finding; remediation is governed by ADR 013 and current work.

## Symptom

The Challenges page displayed a stale/outdated-response recovery message instead of the recommendation queue.

## Observed evidence

At the diagnostic snapshot, the running API returned five active, recordable recommendations and reported the queue as ready. The backend queue had not disappeared.

An isolated diagnostic reproduced a persistent rejection scenario where a stored browser revision was ahead of the current server revision. Repeated valid responses could be rejected indefinitely by the client watermark logic.

The exact persisted state of the affected personal browser was not available, so the precise trigger of the original screenshot was not conclusively proven.

## Design finding

A persistent browser revision watermark/epoch recovery protocol was disproportionate to the local single-user scope and could itself become a permanent UI lockout after database restore/recreation or stale local state.

## Resolution decision

ADR 013 supersedes the persistent revision-watermark/epoch model.

The frontend uses ordinary request cancellation, query invalidation/refetch, explicit reset cleanup, and identity-aware mutation callbacks. Progress generation remains only where required for reset/idempotency semantics.

## Follow-up

Queue/browser acceptance tests must distinguish loading/error/shortage/ready states and verify that older asynchronous responses cannot overwrite state produced by a newer successful mutation.
