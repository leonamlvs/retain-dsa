# ADR 007: Intervals discovery mapping

Status: **accepted replacement decision** on 2026-09-12. Not yet implemented.

## Observed constraint

The separate live metadata smoke on 2026-09-11 resolved all 75 official anchors and 22 categories. The assumed `interval` provider topic did not occur on either official Intervals anchor:

- Provider ID 435, `non-overlapping-intervals`: array, dynamic-programming, greedy, sorting.
- Provider ID 452, `minimum-number-of-arrows-to-burst-balloons`: array, greedy, sorting.

Discovery now rejects this unverified mapping explicitly. It must not interpret the result as verified empty supply, skip difficulties, issue scarcity exceptions, or substitute a static curriculum. M04 mapping acceptance remains open; dependent milestones are on hold. The other live smoke checks (stable identity and advancing Binary Search pagination) passed.

## Rejected proposal retained for history

Keep the official Intervals category. Use the conjunction of `array`, `greedy`, and `sorting` as a coarse, versioned discovery mapping. Request a `greedy` provider scan, then apply all three required tags locally. This can include problems that are not interval exercises; it is a discovery approximation, not a verified interval classifier. Its acceptability therefore requires a product decision.

This approximation was not accepted because it would admit problems without reliable Intervals semantics.

## Decision

Keep Intervals in the official curriculum and leave supplemental discovery explicitly unavailable until a reliable, versioned mapping is verified. Unknown mapping is never evidence of an empty tier.

For a fresh skill whose official anchors begin above Easy, admit the lowest free and available official anchor as an initial-practice exception. Persist the curriculum snapshot, configuration, mapping version, evaluation instant and anchor identity that justified the admission. This does not mark a lower difficulty absent or learned, does not update lower-difficulty memory and does not authorize an unearned higher difficulty.

The exception applies only to initial entry. Later promotion, regression and revalidation retain the rules in ADR 006. If those rules cannot produce a valid candidate, return an explicit shortage.

## Affected acceptance and tests

- Provider tests verify unknown mapping errors and that no absence certificate is issued.
- Scheduler tests verify initial official-anchor admission, normal behavior after the first attempt and explicit shortage when later eligibility cannot be established.
- Persistence and replay tests reconstruct the exception from its immutable decision inputs.
- A future mapping requires a new accepted ADR and versioned mapping; it cannot rewrite this history.
