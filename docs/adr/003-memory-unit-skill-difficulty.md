# ADR 003 — Memory unit is Skill + Difficulty

## Context

Repeating exact problems risks memorizing solutions rather than retaining transferable problem-solving ability.

## Decision

Memory is tracked per `User + Skill + Difficulty`, not per exact problem.
Exact problems have separate cooldown/repetition state.

## Consequences

- Reviews can use different problems.
- Difficulty can regress with forgetting.
- Historical problem completion remains separate from retention.
- No cross-difficulty transfer in MVP.
