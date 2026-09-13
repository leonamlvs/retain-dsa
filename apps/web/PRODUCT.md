# Product

<!-- impeccable:product-schema 1 -->

## Context Authority

This is the Impeccable product context for `apps/web`, derived from the repository's
confirmed specifications. It is a navigation aid, not an independent specification.
Follow [AGENTS.md](../../AGENTS.md) for source precedence. Current behavior is defined
by [product.md](../../docs/spec/product.md),
[frontend.md](../../docs/spec/frontend.md), and the relevant executable contracts.
Report contradictions rather than silently reconciling them here.

## Platform

web

## Users

One person practicing data structures and algorithms for technical interviews and
long-term retention. The application helps that person choose what to practice,
record how an attempt went, and understand their practice history.

## Product Purpose

Retain DSA supports continuous practice through useful next-problem recommendations
and structured reflection. Success means the user can return, find appropriate
practice, save feedback reliably, and see accurate curriculum coverage and activity.
The product does not promise interview readiness or an objective measure of knowledge.

## Positioning

The product combines the current official LeetCode 75 curriculum, local attempt
history, adaptive `Skill + Difficulty` memory, free LeetCode problem discovery, and
deterministic recommendations. LeetCode remains the place to read and solve problems;
Retain DSA guides practice and records its outcomes.

## Operating Context

- Local-first, single-user application with no authentication. The supported runtime
  is Docker Compose via `yarn dev` from the repository root; the default application
  origin is `http://localhost:3000`. PostgreSQL stays private to the Compose network.
- `/challenges` is the primary route. The user opens a recommended problem on
  LeetCode, optionally starts a timer, then opens the completion modal to give feedback.
- Saving feedback records an attempt. Viewing a problem, using or clearing the timer,
  and canceling the modal record no attempt.
- `/analytics` presents saved practice history. Both routes include curriculum
  percentage and an activity heatmap. There is no Settings route in the MVP.
- The interface supports desktop and mobile web. A return after inactivity must still
  lead to useful practice; recommendations are suggestions, not overdue obligations.

## Capabilities and Constraints

- The persisted recommendation queue normally displays five problems, controlled by
  configuration and available supply. Valid recommendations remain usable during
  provider degradation; loading, failure, shortage, and accepted empty states differ.
- The optional timer survives refresh and has one owner, running or paused. The user
  must clear that timer before starting another. Duration never affects scheduling.
- Completion requires independence, pattern recognition, implementation difficulty,
  and Big-O / complexity feedback. Duration is optional. A successful submission
  records exactly one attempt; cancellation records nothing.
- Curriculum coverage is percentage-only and reflects completed current free,
  available official anchors. Supplemental work does not complete a paid anchor.
- Attempt history and activity do not decay. Internal retention estimates may decay
  and must never be presented as an objective percentage of knowledge. Historical
  activity uses the local date stored at completion, even after timezone changes.
- Analytics covers attempts, unique problems, streaks, activity, skill and difficulty,
  feedback distributions, evolution over time, and median recorded duration. The
  canonical metric definitions remain in the product specification and API contract.
- Full Progress Reset sits at the bottom of application content and requires explicit
  destructive confirmation. It clears user progress and browser timer/drafts while
  preserving global catalog, curriculum, and skill data.
- The web app communicates with the backend only through the generated HTTP/OpenAPI
  client. Preserve the independent frontend/backend boundary described in
  [architecture.md](../../docs/spec/architecture.md).
- MVP exclusions include a hosted problem statement or editor, code execution or
  judging, AI tutoring, multiple providers, notifications, daily quotas, solve-time
  targets, mandatory problem counts, and an interview-readiness score. Production
  deployment and a live demo are not MVP requirements.

## Brand Commitments

Preserve the name **Retain DSA** and the existing factual product language. The
binding interface direction is recorded in
[frontend.md](../../docs/spec/frontend.md#visual-direction).
Preserve the actual footer destinations: [LinkedIn](https://www.linkedin.com/in/leonamlvs/)
and [GitHub](https://github.com/leonamlvs).

## Evidence on Hand

- [Product specification](../../docs/spec/product.md): purpose, terminology, scope,
  workflows, and acceptance criteria.
- [Frontend specification](../../docs/spec/frontend.md): interaction, presentation,
  responsiveness, and accessibility requirements.
- [Existing interface](src/app.tsx), [styles](src/styles.css), and
  [HTML entry](index.html): incumbent implementation and product copy.
- [Runtime instructions](../../README.md) and [Compose configuration](../../compose.yaml):
  local startup and persistence context.

External testimonials, customer claims, and performance or interview-outcome claims
are not established by these sources and must not be invented.

## Product Principles

1. Make the next practice decision useful, including after a long absence.
2. Keep practice voluntary; avoid turning suggestions or activity into obligations.
3. Treat saved feedback as the completion event and preserve the user's historical facts.
4. Keep curriculum coverage, historical activity, and estimated retention distinct.
5. Preserve user control and local data through clear state, recoverable failures,
   and deliberate destructive actions.

## Accessibility & Inclusion

Follow the frontend specification: semantic HTML, readable contrast, visible keyboard
focus, adequate touch targets, and state information that does not depend on color.
Heatmap cells expose date and count to keyboard and assistive technology. Charts need
accessible labels or summaries. Modals trap and restore focus and support the specified
close actions. Respect reduced motion and keep the complete workflow usable on mobile.
