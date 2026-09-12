# Scheduler specification

## Responsibility split

Keep three concerns separate:

1. **Memory engine** — when a `Skill + Difficulty` needs review.
2. **Recommendation engine** — which learning needs should be represented in the active queue.
3. **Problem discovery** — which external problems can satisfy a requested need.

Provider infrastructure returns normalized candidates. It never chooses the recommendation winner.

## Memory key

Memory is tracked per:

```text
User + Skill + Difficulty
```

No row means `UNSEEN`. Exact-problem repetition/cooldown is separate. There is no cross-difficulty memory transfer in the MVP.

## Feedback scoring

The user answers concrete questions rather than directly selecting an FSRS rating.

Required dimensions and initial weights:

```text
independence   0.35
recognition    0.30
implementation 0.20
complexity     0.15
```

Persist raw categorical answers. Map them to fixed-point normalized values, compute the weighted raw score without premature rounding, then map the score to a rating:

```text
score < 0.40        => AGAIN
0.40 <= score < .60 => HARD
0.60 <= score < .85 => GOOD
score >= .85        => EASY
```

Apply the strongest assistance/failure cap after raw scoring:

- independence `FAILED` or `FULL_SOLUTION`, or implementation `UNABLE` -> maximum `AGAIN`;
- `SUBSTANTIAL_HELP` -> maximum `HARD`;
- `ONE_HINT` -> maximum `GOOD`;
- otherwise `EASY` is possible.

Persist raw answers, raw score, applied cap, final rating, and the relevant scoring/configuration version. Duration is never part of the scheduler score.

## Memory engine

Use a versioned FSRS adapter/library for `Skill + Difficulty` memory. Adapter parameters and serialized state must be explicit and testable.

Initial configuration:

```text
reviewThreshold     = 0.80
regressionThreshold = 0.50
```

Interpretation:

- `R >= reviewThreshold`: healthy enough for normal progression decisions;
- `regressionThreshold <= R < reviewThreshold`: review need;
- `R < regressionThreshold`: prefer revalidation/lower-difficulty practice before confidently continuing advanced practice.

Never regress below Easy. Historical attempts and curriculum coverage remain intact.

## Progression evidence

Normal progression requires two positive (`GOOD` or `EASY`) attempts on distinct problems at the relevant difficulty after the latest failure boundary.

`HARD` maintains the current focus. `AGAIN` weakens the current state and may make lower-difficulty practice preferable.

### Structural supply exceptions

Structural supply is the count of distinct free, available problems matching the skill and difficulty before personal cooldown or active-card exclusions.

- supply >= 2: require the normal two distinct positive problems;
- exactly 1, proven by a fresh complete discovery result: one positive attempt on that problem may satisfy the progression evidence requirement, and the exception is recorded;
- exactly 0, proven by a fresh complete discovery result: the structurally absent tier may be skipped;
- unknown, stale, partial, timed-out, failed, or unsupported discovery: no scarcity exception.

Cooldown is never evidence of structural absence. Exceptions do not create memory for an unseen difficulty and do not transfer learning across difficulties.

## Forgetting and revalidation

Historical eligibility is not erased merely because retention decays.

When an advanced practiced difficulty has regressed below the configured boundary, one fresh positive attempt at the nearest relevant lower practiced difficulty, while that lower memory is currently healthy, may reopen advanced revalidation. That lower attempt does not update the advanced memory state.

If every lower tier is structurally proven absent, an already admitted difficulty may be used for revalidation. This does not authorize a previously unearned higher difficulty.

Use current scheduler rules only. The MVP does not retain multiple scheduler algorithm implementations solely to reproduce historical ranking decisions.

## Review versus curriculum progression

The engine considers:

- retention need;
- curriculum coverage need;
- progression value;
- diversity;
- recent exposure.

Reviews must not permanently block curriculum coverage. When progression is selected and an eligible unfinished free official anchor exists, prefer that anchor. A curriculum anchor may also satisfy a review need. Reviews normally prefer a different supplemental problem to test transfer.

The queue should contain at least one curriculum-progression opportunity whenever such an eligible anchor exists, without treating that as a rigid quota when the same card can satisfy multiple needs.

## Candidate eligibility

A recommendation candidate must satisfy all applicable hard constraints:

- free;
- currently available;
- correct target skill mapping;
- compatible difficulty/admission state;
- not already active elsewhere in the queue;
- exact problem not inside personal cooldown;
- provider identity valid and deduplicated.

Never relax free/available/duplicate/cooldown exclusions just to fill the queue. An explicit shortage is valid.

## Exact-problem repetition

Prefer unseen eligible problems.

A completed exact problem enters cooldown:

```text
clamp(memoryNextInterval * cooldownMultiplier, minCooldown, maxCooldown)
```

Initial tuning:

```text
cooldownMultiplier = 3
minCooldown        = 30 days
maxCooldown        = 180 days
```

After cooldown, a previously attempted problem may return with a repetition penalty, while unseen alternatives remain preferred.

## Discovery

MVP provider: LeetCode only.

Discovery is dynamic and metadata-only. Never store challenge content unnecessarily and never recommend Premium problems.

For a resolved need:

1. query eligible cached metadata;
2. if the structural candidate pool is below the configured minimum, perform bounded provider discovery;
3. normalize and cache accepted metadata;
4. continue until target pool, verified exhaustion, unsupported mapping, or operation budget;
5. rank the resulting eligible pool deterministically.

Initial tuning:

```text
candidatePoolMinimum = 10
candidatePoolTarget  = 25
```

Metadata freshness and queue replenishment are separate concerns: stale metadata may be refreshed even when the current pool is large enough.

A complete discovery scan may prove structural supply. Partial/error results never prove zero/one supply.

## Intervals policy

Supplemental Intervals discovery remains explicitly unsupported until a reliable versioned mapping is verified. Broad `array + greedy + sorting` approximation is not accepted as evidence that a supplemental problem belongs to Intervals.

Unknown mapping means supply is `UNKNOWN`, not zero.

For a fresh skill whose lowest free available official anchor is above Easy, the scheduler may allow a first-practice exception at that lowest official anchor difficulty. This is an official-anchor entry exception only: it does not prove lower supply absent, mark lower tiers learned, update lower memory, or grant higher eligibility.

After the first attempt, ordinary progression, regression, and revalidation rules apply.

## Ranking and determinism

Candidate ranking must be deterministic and configuration-driven. The same canonical state, configuration, normalized candidate set, and injected clock must produce the same ordering.

Ranking may consider:

- unseen preference;
- target skill/difficulty match;
- curriculum anchor preference when progression is selected;
- secondary-tag diversity;
- recent exposure;
- exact-problem repetition penalty.

Avoid random candidate selection and unexplained magic constants.

## Refill lifecycle

Saving an attempt commits the completion/memory/cooldown lifecycle first and creates durable refill work. Provider HTTP never runs inside the database transaction.

Refill then:

1. determines current needs;
2. inspects eligible cached supply;
3. performs bounded discovery when needed;
4. ranks the resulting pool, including safe cached fallback if provider access fails;
5. publishes valid recommendations only after the necessary current-state validation.

Provider failure must never roll back a committed attempt.

## Required invariants

At minimum, tests cover:

- Premium is never recommended;
- unavailable problems are never recommended;
- exact in-cooldown problems are never recommended;
- no active duplicate problem;
- active queue never exceeds configured size;
- canceling feedback changes no scheduler state;
- one successful save creates exactly one attempt;
- one attempt updates only one primary `Skill + Difficulty` memory;
- same canonical state/config/clock/candidate set produces the same ordering;
- provider failure does not destroy cached curriculum/catalog data;
- unsupported discovery never becomes false empty-supply evidence;
- reset removes user-owned scheduler state while preserving global catalog data.
