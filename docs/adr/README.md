# ADR index

ADRs preserve decision rationale. They are historical records, not the place to discover current application behavior; current behavior belongs in `docs/spec/*`.

| ADR | Decision | Status | Notes |
|---|---|---|---|
| 001 | Modular monolith backend and monorepo | Accepted | Current |
| 002 | LeetCode-only dynamic discovery | Accepted | Current |
| 003 | Memory unit is `Skill + Difficulty` | Accepted | Current |
| 004 | OpenAPI is the frontend/backend contract | Accepted | Current |
| 005 | UTC instant + immutable local completion date | Accepted | Current |
| 006 | Reproducible study state and policy amendments | Partially superseded | Replay/browser portions superseded by ADR 012/013; retained as history |
| 007 | Intervals discovery mapping | Accepted | Decision current; implementation-status wording inside the historical ADR is non-normative |
| 008 | Yarn workspaces | Accepted | Current |
| 009 | Single-origin Docker runtime | Accepted | Current |
| 010 | Prisma 7 client configuration | Accepted | Current |
| 011 | Authoritative browser session recovery | Superseded | Superseded by ADR 013 |
| 012 | Bounded reconstruction instead of full historical replay | Accepted | Supersedes replay/versioning portions of ADR 006 |
| 013 | Simplified browser consistency model | Accepted | Supersedes ADR 011 and browser-fence portions of ADR 006 |

A superseded ADR remains in the repository unchanged except for normal lifecycle metadata/links if added later. Do not delete or rewrite its original decision as though it never existed.
