# ADR 005 — UTC instants plus immutable local completion date

## Context

The developer may travel/change timezone. Streak and heatmap should behave like daily-calendar activity, not rolling 24-hour windows.

## Decision

Store completion instant in UTC plus:

- IANA timezone at completion,
- local calendar date at completion.

Streak/heatmap use the stored local date.

## Consequences

- Historical heatmap does not shift after timezone changes.
- Consecutive local dates maintain streak even if >24 hours apart.
- UTC remains the canonical instant representation.
