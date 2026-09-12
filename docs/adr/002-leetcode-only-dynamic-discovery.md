# ADR 002 — LeetCode-only dynamic discovery for MVP

## Context

The curriculum reference is the official LeetCode 75 and the goal is to continuously find related free challenges.

## Decision

Use LeetCode as the only MVP provider.
Discovery is dynamic from the start and cached locally.
Premium problems are never recommended.
Provider access is isolated behind an interface.

## Consequences

- Consistent study environment.
- Simpler difficulty/tag semantics than multi-provider MVP.
- LeetCode GraphQL/internal behavior is a technical risk.
- Provider abstraction/cache reduce lock-in and outage impact.
