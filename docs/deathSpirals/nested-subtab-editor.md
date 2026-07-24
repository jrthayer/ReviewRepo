# Session summary: nested sub-tab editor

## Summary

This session built out the admin editor's support for nested sub-tabs (a
sub-tab of a sub-tab, to arbitrary depth) from scratch, then iterated
repeatedly on the authoring UX around it: an "intro text" concept that was
built, tested, and ultimately ripped out and replaced with a simpler model;
a run of visibility/focus bugs as that simpler model got stress-tested
against real interactions; and a handful of smaller, cleanly-executed
polish requests (cog menu, indentation, delete confirmations, a "[...]"
placeholder for hidden fields) layered on top once the foundation settled.
The session was productive but noticeably rockier in its middle third than
its start or end.

## Why this session got frustrating

**A misread request got built out before it was checked against the user's
actual mental model.** The request "I want to be able to put sub-tabs after
a block of text" was interpreted as a new, separate concept — a per-level
"intro" field with its own visibility toggle, add/remove cog actions, and
confirmation dialogs. That interpretation was internally consistent and
got fully implemented and tested, but it was solving a problem the user
didn't have. The actual ask, revealed several turns later, was much
plainer: every bar just has its own always-visible field, and clicking a
tab swaps it — no separate "intro" concept at all. By the time that
surfaced, the wrong model had several turns of feature work sitting on top
of it (cog delete-all, confirm-before-remove, depth-generalized toggles),
all of which had to be discarded together rather than one small correction.

**Testing validated the implementation against its own assumptions instead
of the user's.** When asked to "close all other text fields when a subtab
is clicked," the fix was designed and verified using scenarios constructed
to match the *implementer's* reading of that sentence — which passed,
convincingly. It took a concrete, literal counter-example from the user
("when I click Tab 1 I expect X hidden, Y hidden, Z visible") to reveal
the reading was wrong in a different way than first patched. Self-authored
test cases are a weak check on whether an instruction was understood
correctly; they mostly confirm internal consistency.

**A clarifying question used implementation vocabulary the user didn't
recognize.** An `AskUserQuestion` mockup referenced a "blank leaf box"
without ever having introduced that term in user-facing conversation. The
user's honest reply — "what is the blank leaf box for?" — was itself a
signal that the question had been framed around internal data-model
concepts rather than what's visibly on screen. That cost a full round
trip just to re-explain terminology before the actual design question
could be answered.

**Testing bugs looked like product bugs.** Once the correct, simpler model
was implemented, several rounds of manual browser testing produced results
that looked like regressions — content disappearing, buttons doing nothing
— but were actually artifacts of the test automation itself (clicking
coordinates from a screenshot taken before the page had scrolled, or before
a prior action's DOM change had settled). Distinguishing "the code is wrong"
from "the test just clicked the wrong thing" took deliberate isolation
(calling functions directly via console, checking state before assuming a
UI symptom) that could have been reached for sooner.

**The eventual correct architecture was genuinely more stateful than it
first looked.** "Exactly one field visible at a time, and switching/adding/
deleting must never silently lose a hidden branch's content" turned out to
need careful handling at every transition: switching tabs, adding a sibling,
deleting the active tab, deleting a whole bar, clicking an already-active-
but-unfocused tab. Several of these were only discovered as edge cases
after the fact (a data-loss bug on switching away from nested content, an
early-return bug on re-focusing an already-active tab) rather than being
enumerated up front, so fixes arrived reactively, one exposed case at a
time.

## Where we started, what happened in between, where we ended up

**Start:** a single flat sub-tab bar existed under a review tab's body.
The first ask was to make sub-tabs nest recursively (a sub-tab of a
sub-tab, arbitrary depth) — planned explicitly and implemented cleanly:
`splitSubTabs` became depth-aware, `renderCard`/`renderSubTabLevel` in
`shared.js` recursed, `app.js` tracked an `expandedSubPath` array instead
of a single index, and the admin editor grew a `subTabStack` array (one
entry per depth) with per-level pill bars. This landed with no real
missteps.

**Early iteration, still solid:** indentation for nested bars was added
then later removed on request; a real bug was found and fixed where
deleting a sub-tab's last remaining tab left an orphaned empty bar instead
of cleanly collapsing back to plain content; a cog (⚙) menu was added per
bar for less-common actions, including a "delete all sub-tabs on this bar"
confirmation.

**The detour:** a request to let a sub-tab have a shared block of text
before its own pills was built as a distinct "intro" feature — a per-level
optional field with its own show/hide toggle and cog actions to add,
remove, and confirm-remove it. This shipped and was tested against its own
logic successfully. A follow-up request ("close every other field when you
click a tab, including the top one") was implemented on top of that same
"intro" foundation — again shipped, again self-consistent — until the user
supplied a concrete example proving the mental model itself was off, and
then, in the same exchange, explained the actual model wanted: no toggle,
no separate "intro" concept — every bar simply has one always-visible
field, adding a sub-tab always appends a new bar+field below without
touching the one above it. That was confirmed explicitly and the "intro"
feature was removed wholesale and replaced with this simpler design,
along the way fixing a genuine data-loss bug (nested content under a tab
being silently dropped when switching away from it, since it had only
ever been combined transiently for output, never persisted back into that
tab's own stored text).

**Recovery and polish:** with the simpler model in place, the remaining
requests landed cleanly and quickly: moving the "+ Sub-tab" action out of
the per-bar cog and into the format toolbar, with a strict "exactly one
field visible at a time" rule (clicking a tab hides every other field,
including the top-level one); a real bug fix for clicking a tab that was
already active for its bar but not currently the visible one (it silently
did nothing before); repositioning the BBCode-warnings bar to the very
bottom of the stack and having it validate whichever field is currently
visible rather than always the top one; adding a "[...]" placeholder row
in place of every hidden field, clickable to jump straight to it; and
finally restoring a "+ Sub-tab" option to the per-bar cog so a bar can be
nested into directly without first clicking into it.

**End state:** the admin editor supports arbitrarily deep nested sub-tabs,
each level as a persistent bar of pills with its own content field;
exactly one field is visible anywhere in the editor at a time, with
one-click navigation to any hidden one via `[...]` placeholders; adding,
switching, and deleting sub-tabs at any depth correctly preserves nested
content instead of losing it; and the surrounding UI (cog menu, BBCode
warnings, delete confirmations) is consistent across every depth rather
than special-cased for the top level.
