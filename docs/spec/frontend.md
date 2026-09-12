# Frontend specification

## Stack and boundary

- React + Vite + TypeScript.
- React Router for routes.
- TanStack Query for server state.
- Generated OpenAPI client for backend communication.
- Local component state for UI-only state.
- LocalStorage-backed timer state.
- No Redux in the MVP unless a concrete need emerges.

The frontend must not import backend domain, persistence, Prisma, or service implementation code.

## Routes

- `/challenges` — primary application page.
- `/analytics` — analytics page.

No Settings page in the MVP.

## Navigation

Use a minimal shared header with:

```text
[logo] [streak] [Challenges] [Analytics]
```

The logo routes to Challenges. The active route is clearly indicated without an enterprise-style sidebar.

## Visual direction

Use a premium dark developer-tool aesthetic adapted for repeated application use rather than a marketing landing page.

Characteristics:

- near-black/deep-navy dominant background;
- strong modern sans-serif hierarchy;
- selective multicolor accents, especially blue and green, with occasional secondary/warm accents where semantically useful;
- generous whitespace and strong vertical rhythm;
- subtle surfaces and low-contrast borders;
- restrained glow;
- limited monospace/terminal-inspired details for metadata, timers, IDs, and technical context;
- editorial composition rather than a grid of generic dashboard cards.

The UI should feel technical, calm, polished, and focused. Avoid exaggerated cyberpunk treatment, excessive gradients, glassmorphism, glowing borders, large shadows, or a rounded container around every element.

## Design system

Centralize semantic tokens for:

- application background;
- working/elevated surfaces;
- primary/secondary/muted text;
- primary and secondary accents;
- subtle/strong borders;
- success/warning/destructive states;
- difficulty indicators;
- heatmap intensity;
- focus state.

Use semantic tokens rather than component-specific color literals. Important meaning must never rely on color alone.

Typography establishes page/section hierarchy. Operational controls remain compact even when page headings are editorial and large.

Prefer spacing, alignment, rules, and typography over unnecessary nested cards.

## Challenges page

### Overview

Display:

- LeetCode 75 percentage-only progress;
- GitHub-like activity heatmap.

The progress treatment should be visually integrated and compact rather than a large dashboard widget.

### Recommended challenges

Display the persisted current recommendations, normally five when supply permits.

Problem title is the strongest element. Difficulty and primary skill are immediately visible; secondary tags are quieter. Timer information is readable but not visually dominant.

Conceptual hierarchy:

```text
RECOMMENDED · 5 CHALLENGES

01
Search in Rotated Sorted Array
Medium · Binary Search · Array

00:08:31                      [Pause] [Clear]
                              [View ↗] [Complete]
```

This is a hierarchy example, not a required literal layout.

Idle challenge actions:

```text
[View ↗] [Start] [Complete]
```

Paused timer state:

```text
00:08:31                      [Resume] [Clear]
                              [View ↗] [Complete]
```

Active or paused timer state may receive subtle emphasis without becoming aggressive.

### Shortage/degraded state

When discovery cannot safely fill all slots, keep valid persisted cards usable and present an explicit shortage/degraded reason. Unsupported mapping is not displayed as verified empty supply.

Do not present transport/recovery errors as “no recommendations”.

## Timer

At most one challenge may own the timer at a time, whether its state is `RUNNING` or `PAUSED`.

Persist enough information to reconstruct elapsed time without continuously writing ticking seconds:

- recommendation/issuance identity;
- progress generation when applicable to reset validity;
- `RUNNING` or `PAUSED`;
- start timestamp;
- elapsed time accumulated before the current run.

Elapsed running time is derived from timestamps.

Starting the timer must not depend on a persistent browser revision watermark or epoch-fence protocol. Ordinary request cancellation/cache invalidation handles server requests; timer callbacks validate the timer identity they intend to modify.

Refresh/reopen must restore the owned timer. A full progress reset invalidates and clears user timer/draft state.

### Clearing the timer

A running or paused timer exposes a `Clear` action.

Clearing the timer:

- discards the unsaved elapsed duration;
- removes the persisted timer state;
- releases timer ownership immediately;
- allows the user to start any other recommended challenge;
- does not create an attempt or cause any server-side progress mutation.

Starting a timer for another challenge must not silently replace an existing running or paused timer. The existing timer must be cleared first.

`Clear` replaces the previous timer `Reset` action. There is no separate reset-to-zero behavior in the MVP.

## Completion modal

`Complete` opens the modal and does not record an attempt.

Required fields:

- independence;
- recognition;
- implementation;
- Big-O / complexity.

Optional:

- duration.

If the timer is active, the modal freezes the displayed suggested duration while preserving the underlying elapsed-time semantics. The user may edit or clear the duration before submission.

Cancel, close button, backdrop click, and Escape close without recording. If the timer was running, cancellation restores it including elapsed modal time.

After submission begins, keep the exact submitted answers/duration/idempotency request stable for that submission attempt and prevent accidental edits until the request resolves.

Successful save clears only the matching timer.

## Browser consistency model

The browser must not use a persistent state-revision watermark that can permanently reject otherwise valid server responses. Do not implement client-side epoch fencing as a general synchronization protocol.

Use ordinary application mechanisms:

- TanStack Query request cancellation;
- query-key scoping for state that genuinely depends on progress generation/timezone/range;
- cache invalidation/refetch after successful mutations;
- explicit cleanup after successful reset;
- mutation callbacks that confirm the identity/generation of the state they intend to alter.

Progress generation remains a server-side/reset boundary where required by API idempotency and stale-reset protection; it is not a general browser watermark.

## Analytics page

Share the same top overview language as Challenges:

- LeetCode 75 percentage;
- activity heatmap.

Display the required MVP analytics from `product.md`.

Avoid a uniform grid of KPI cards. Prefer clear section hierarchy, whitespace, subtle rules, accessible tables/labels, and charts that optimize readability over decoration.

Do not use 3D charts, decorative gradients, or unnecessary animation.

## Heatmap

- GitHub-like square activity grid.
- Intensity reflects saved completion count only.
- Historical cells use the stored local completion date supplied by the backend; do not re-bucket history using the current timezone.
- Cells expose date/count to keyboard and assistive technology.
- Loading, failure, and accepted zero activity are visually distinct states.

## Reset

Place Full Progress Reset discreetly at the bottom of application content.

Require explicit destructive confirmation. On successful reset:

- clear user-scoped browser caches;
- clear timer/draft state;
- adopt the new progress generation returned by the server when applicable;
- render the fresh state without preserving obsolete user data.

A failed reset must not pretend that local/server state was cleared.

## Footer

- LinkedIn: `https://www.linkedin.com/in/leonamlvs/`
- GitHub: `https://github.com/leonamlvs`

Do not invent replacement social URLs.

## Motion

Use restrained functional motion only: hover/focus transitions, small state transitions, modal entrance/exit, timer-state feedback, and progress changes.

Respect `prefers-reduced-motion`. Avoid parallax, continuous decorative animation, or marketing-style scroll sequences.

## Responsive behavior

The interface must remain usable from desktop to mobile:

- challenge controls may wrap/reorder;
- headings scale down appropriately;
- analytics stack when needed;
- heatmap overflow is handled deliberately;
- interactive controls retain adequate touch targets.

Responsive decisions should follow content needs rather than framework breakpoints alone.

## Accessibility

- semantic HTML;
- WCAG-appropriate contrast;
- visible keyboard focus;
- color-independent state communication;
- accessible chart/heatmap labels or summaries;
- correct modal focus trapping/restoration;
- Escape handling where appropriate;
- adequate interactive target size;
- reduced-motion support.

## Frontend acceptance tests

Critical behavior includes:

- queue renders valid persisted recommendations;
- timer start -> refresh -> timer continues;
- running timer -> clear -> another challenge can start;
- paused timer -> clear -> another challenge can start;
- clearing a timer -> no attempt or progress/memory/analytics/recommendation mutation;
- starting another challenge while a timer is still owned -> existing timer is not silently replaced;
- completion save -> queue/analytics update;
- cancel completion -> no attempt/state mutation and timer resumes correctly;
- reset -> user state and browser timer/drafts are cleared while global data remains;
- stale/out-of-order requests cannot overwrite a newer successful mutation result, using ordinary cancellation/invalidation and identity checks rather than persistent revision fences.
