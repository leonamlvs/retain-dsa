# Product specification

## Goal

Retain DSA is a local-first web application for continuous DSA interview practice and long-term retention.

It helps the user decide what to practice by combining:

- the current official LeetCode 75 curriculum as the minimum coverage reference;
- practice history;
- `Skill + Difficulty` memory state;
- free LeetCode problem discovery;
- structured post-attempt feedback;
- deterministic recommendation rules.

## Explicit non-goals for the MVP

The MVP does not:

- host challenge statements or an editor;
- execute or judge user code;
- contain an AI tutor;
- require authentication;
- support multiple problem providers;
- send notifications;
- impose daily quotas, solve-time targets, or mandatory problem counts;
- expose an interview-readiness score;
- require production deployment/CD.

## Core concepts

### History

Attempts and feedback record what happened. Historical attempts do not decay.

### Curriculum coverage

Coverage represents which current free, available official LeetCode 75 anchors have been completed in the app. Coverage does not decay with time, though the current denominator may change when the official curriculum changes.

### Retention

Retention is an internal estimate used by the scheduler for `Skill + Difficulty`. It decays with time and must not be presented as an objective percentage of knowledge.

### Recommendations

Recommendations are current practice suggestions, not obligations or overdue tasks.

## Curriculum

- The curriculum source is the current official LeetCode 75 study plan.
- Synchronize it on application startup.
- Reconcile items by stable provider problem identity, not title or display number.
- If synchronization fails, retain the last valid local snapshot.
- Paid problems are excluded from recommendations and from the current progress denominator.
- Unavailable current anchors are excluded from the current denominator while their history is preserved.
- The progress UI shows percentage only, not `x / y`.
- A supplemental problem does not complete a paid official anchor.
- If an anchor leaves the curriculum, it stops affecting the current percentage while historical attempts remain.

## Skills

- The skill taxonomy follows the categories relevant to the official LeetCode 75 curriculum.
- Do not introduce a deep hand-maintained subskill hierarchy in the MVP.
- One attempt updates one primary `Skill + Difficulty` memory state.
- Secondary provider tags may support discovery, diversity, and analytics without creating additional memory updates.

## Recommendation queue

- Default visible queue size is five and is configuration-driven.
- Active recommendations are persisted and do not randomly reshuffle on browser refresh.
- Viewing a problem or using the timer does not change progress.
- Saving feedback is the completion event.
- Completion may update memory, exact-problem cooldown, curriculum coverage, analytics, and queue refill.
- The queue should continue to provide practice after long inactivity by preferring easier/revalidation work when appropriate rather than treating inactivity as “nothing due”.
- A recommendation issued in the current progress generation remains recordable once until reset even if it is later replaced or its current metadata changes. The original issuance skill/difficulty snapshot is used for that attempt.

## Challenge interaction

A challenge exposes:

- provider identity/display number and title;
- difficulty;
- primary skill and secondary tags;
- View/Open action;
- optional timer controls;
- Complete action.

`View` opens the provider page and records nothing. `Start` begins the optional local timer. `Complete` opens the feedback modal and does not itself record an attempt.

At most one challenge may own the timer at a time, whether it is running or paused.

A running or paused timer may be cleared at any time. Clearing it discards its unsaved elapsed duration, removes the persisted timer state, and immediately releases timer ownership so the user may start any other challenge.

Clearing a timer does not create an attempt, update progress or memory, affect analytics, or change the recommendation queue.

Starting another challenge must never silently replace or discard an existing running or paused timer. The existing timer must be cleared first.

## Feedback and completion

The completion modal requires four dimensions:

1. independence;
2. pattern recognition;
3. implementation difficulty;
4. Big-O / complexity analysis.

Duration is optional and never influences scheduling in the MVP.

Canceling the modal through any supported close action records nothing. If a timer was running, cancellation restores the running timer semantics, including elapsed modal time. Saving creates exactly one attempt and clears only the matching timer.

All saved attempts count as activity. If the attempt corresponds to a current eligible official anchor, saving it counts that anchor as completed even when the pedagogical rating is `AGAIN`.

## Calendar activity

Each saved attempt stores:

- completion instant in UTC;
- the IANA timezone used at completion;
- the resulting local calendar date.

Streak and heatmap calculations use the stored local date, so historical activity does not move when the user later changes timezone.

## Analytics

The MVP exposes, at minimum:

- current LeetCode 75 percentage;
- activity heatmap;
- unique problems attempted/completed as defined by the analytics contract;
- total attempts;
- current streak;
- longest streak;
- distributions by primary skill and difficulty;
- distributions for each feedback dimension;
- attempt evolution over time;
- median recorded duration, excluding null duration while treating zero as a valid recorded value.

Historical analytics do not decay.

## Progress reset

Full Progress Reset is available at the bottom of the application content behind an explicit destructive confirmation.

Reset removes all user-owned progress, including attempts, feedback, memory, cooldown/user-problem state, recommendations, curriculum completion derived from user data, timer/draft browser state, and other user-owned work records.

Reset preserves global provider/catalog/curriculum/skill data.

After reset, the scheduler treats the user as fresh.

## Scope

- Local-first and single-user.
- One seeded internal user is acceptable to avoid unnecessary future persistence refactors.
- No live demo is required for the MVP.

## MVP acceptance

The MVP is complete when all of the following are true:

1. startup synchronizes the official LeetCode 75 or safely retains the last valid snapshot;
2. `/challenges` reliably displays up to the configured five valid current recommendations and refills after completion;
3. the optional timer starts reliably, survives refresh, supports pause/resume and clearing, allows another challenge timer to start after the current timer is cleared, and follows the specified modal save/cancel behavior;
4. all four feedback dimensions plus optional duration save exactly one attempt and update one `Skill + Difficulty` memory state;
5. dynamic free LeetCode discovery works for supported mappings and reports unsupported mappings as unknown/shortage rather than false empty supply;
6. `/analytics` renders the required metrics and activity heatmap from saved attempts;
7. reset clears user progress while preserving global catalog/curriculum data and immediately returns the UI to a fresh state;
8. the Docker local runtime starts the application and private PostgreSQL through the supported command, and the full verification gate passes.
