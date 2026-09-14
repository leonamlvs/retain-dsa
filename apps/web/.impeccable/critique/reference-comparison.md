Method: dual-agent (A: design_assessment · B: technical_assessment).

**Retain already has a suitable dark palette. The largest improvement will come from stronger typography, a clearer practice hierarchy, and a genuinely readable activity calendar.**

I compared both live references with desktop/mobile captures of Challenges, Analytics, and the feedback modal. Local captures used illustrative data, not personal progress.

The current interface is coherent but visually interchangeable with an admin dashboard: repeated rounded panels give coverage, recommendations, analytics, and reset similar weight. Its product-specific strengths are the problem identities, recommendation reasons, optional timer, and focused reflection workflow.

JSM's strongest transferable qualities are its decisive type hierarchy, section-spanning rules, selective green emphasis, and restrained monospace details. Its captured heading uses Geist Sans at 58px; major section headings reach 40–48px. Retain's section headings are mostly 20px and problem titles 17px. The reference's detail sections are especially useful for this application; its broad hero glow should be substantially quieter in a repeated-use tool. [JSM reference](https://jsmastery.com/waitlist/ai-course)

**Priority 1 — P2: Recompose the interface around practice.**

| Area            | Current implementation                                                                    | Proposed improvement                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typography      | Brand dominates; section and problem headings are small.                                  | Self-host Geist Sans, with limited Geist Mono for IDs/timers. Explore 44–56px route headings on desktop, 30–36px on mobile, and 20–24px problem titles. Keep controls compact and readable.                        |
| Composition     | A large coverage card sits beside a mostly empty activity panel.                          | Integrate percentage-only coverage into a compact page introduction. Give the calendar a deliberate horizontal region and bring recommendations higher on mobile.                                                  |
| Challenge list  | A bordered section contains individually bordered cards. Metadata appears before titles.  | Use spacious rows separated by subtle rules. Lead with title, then difficulty and skill, then quieter secondary tags. Reserve a slightly elevated surface for the owned timer.                                     |
| Color and depth | Blue carries actions, progress, heatmap, and charts; repeated surfaces flatten hierarchy. | Keep near-black/navy foundations. Use blue for interaction, green for recorded activity, amber for Medium/warnings, and warm red for destructive states. Apply any glow locally and faintly.                       |
| Actions         | Five saturated Complete buttons dominate idle rows; Start appears before View.            | Order View → Start timer → Complete. Explore quieter idle completion styling and stronger emphasis for the owned timer, while preserving untimed completion. Increase mobile control height from 36px toward 44px. |
| Analytics       | Equal chart panels, raw uppercase feedback labels, and a cramped evolution table.         | Group content into activity, skill/difficulty, and reflection. Give evolution a readable full-width treatment, align numeric columns, and share human-readable feedback labels with the modal.                     |
| Finish          | Reset is a substantial closing panel.                                                     | Keep it at the bottom with its confirmation, but reduce its visual footprint to a discreet separated row.                                                                                                          |

This would make the first view read as **page identity → compact progress/activity → useful practice**, with terminal character coming from real metadata and timer state.

Relevant implementation: `apps/web/src/styles.css:140`, `:259`, `:279`, `:493`, and `apps/web/src/app.tsx:384`. Suggested follow-up: `$impeccable layout` and `$impeccable typeset`.

**Priority 2 — P1: Rebuild the heatmap's calendar structure and states.**

GitHub's reference uses a broad year view with small consistent squares, stable weekday rows, month labels, a Less–More legend, and a single keyboard entry point. Those structural and interaction details make the activity intelligible. [GitHub reference](https://github.com/leonamlvs)

Retain currently places a 175px-wide, 84-day block inside a 756px-wide grid region. Every day is a separate tab stop; arrow keys do not navigate. On mobile, cells become 9×10px and the period label disappears.

I recommend:

1. **A rolling year by default.** Render weeks as columns and weekdays as rows, with padding at calendar boundaries. Preserve square cells around 11–12px with 3–4px gaps. The backend already supplies 365 days by default, so this primarily changes frontend presentation.
2. **Visible calendar context.** Add month labels, Mon/Wed/Fri markers, a persistent range label, a Less–More legend, and the attempt total for the displayed period.
3. **A green activity scale.** Use zero plus four increasing intensities. Keep explicit count labels; intensity represents saved attempts only.
4. **Efficient interaction.** One tab stop enters the calendar; arrow keys move through dates. Hover, keyboard focus, and touch expose date/count details with clearly visible focus. Include an accessible summary.
5. **Deliberate mobile overflow.** Keep cells square and legible, scroll the calendar horizontally with recent dates initially visible, and retain labels/legend. Avoid shrinking the full year to fit.
6. **Truthful loading and failure states.** A mocked analytics failure currently produces 84 empty cells and a zero-day streak without an alert on Challenges. This contradicts the frontend requirement to distinguish failure from accepted zero activity. Show unavailable/loading state explicitly while keeping usable recommendations visible.

Preserve the backend's stored local completion dates. Fill missing dates with zero only within a successfully loaded range. Derive the displayed-period total from that range; the existing total-attempts metric is lifetime data.

Relevant implementation: `apps/web/src/app.tsx:134`, `:175`, `apps/web/src/styles.css:209`, and `apps/api/src/modules/study/analytics.ts:25`. Suggested follow-up: `$impeccable harden` and `$impeccable adapt`.

The strongest existing features are the restrained palette, two clear routes, and orderly feedback modal. Cognitive load is mostly a hierarchy problem: the five recommendations are a deliberate product choice and should remain. Power users face excessive calendar tabbing; newcomers lack an explanation of Start; mobile users lose date context. A quiet save acknowledgment would also improve the end of an attempt.

One separate interaction proposal deserves attention: all four feedback answers currently default to successful outcomes. Neutral “Choose an answer” defaults could encourage deliberate reflection. This changes interaction behavior and is not an existing requirement for blank defaults.

The independent heuristic baseline is **23/40**; this is a qualitative review, not an automated test score.

| Heuristic            | Score / 4 | Main limitation                                   |
| -------------------- | --------: | ------------------------------------------------- |
| System status        |         3 | Activity availability and save acknowledgment     |
| Real-world language  |         3 | Technical labels and seconds-only duration        |
| User control         |         3 | Good cancel/clear/reset foundations               |
| Consistency          |         3 | Analytics and feedback vocabulary diverge         |
| Error prevention     |         2 | Successful feedback preselected                   |
| Recognition          |         2 | Unlabeled calendar and hidden timer guidance      |
| Efficiency           |         1 | 84 calendar tab stops                             |
| Aesthetic simplicity |         2 | Nested panels and weak title hierarchy            |
| Error recovery       |         3 | Recovery exists; some errors remain technical     |
| Contextual help      |         1 | Optional timer and feedback consequences implicit |

The CLI detector returned zero findings. Browser overlays reported 4 findings on Challenges, 4 on Analytics, and 6 with feedback open; these overlap, rather than representing 14 unique issues. Labels concerned repeated eyebrows, undersized text, and modal border/shadow treatment. The modal shadow is a low-priority stylistic flag; calendar behavior and hierarchy deserve more attention.

Following your saved **comp-first** preference, the next step should be a desktop/mobile Challenges composition showing the new type hierarchy, annual calendar, and one active-timer row. Carry that system into Analytics and the modal, then finish with `$impeccable polish`. No application source changes are part of this comparison.

Questions skipped: two priority areas; your requested visual direction and comparison scope are explicit.
