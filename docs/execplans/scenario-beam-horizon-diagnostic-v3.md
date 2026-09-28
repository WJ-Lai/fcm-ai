# ScenarioBeam horizon diagnostic v3

## Hypothesis

The terminal collapse is caused by an intermediate cutoff after hiring cost is visible but before
the employee engine's delayed revenue is visible.

## Method

Hold the official root, two root candidates, official-opponent belief and two common belief seeds
fixed. Change only `maxOwnDepth` from 1 through 8. Give each row enough deadline and transition
budget to complete. Compare against the paired terminal reference: hire 4/4 wins, skip 0/4.

## Result

Hire leads by 1.4 at depths 1–2. Skip falsely leads by 5.0, 3.6 and 2.2 at depths 3–5. Hire returns
at depth 6 (+4.2) and becomes dominant at 7–8 (+201 or more). Runtime grows from 0.36 to 5.38
seconds. The hypothesis is supported: the three-second tier lands inside the misleading interval.

## Decision

Do not increase a fixed horizon or tune a special hiring bonus. Test a general conservative gate:
only let target-depth search override static when a cheap shallow checkpoint independently selects
the same root. Keep promotion data sealed and re-run the paired single-intervention development set.
