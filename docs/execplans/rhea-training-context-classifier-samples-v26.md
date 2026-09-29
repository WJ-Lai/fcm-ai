# RHEA context classifier validation, final 15-sample stage

Append exactly samples 7–14 for both candidates at all 12 v23 frozen roots. Use the same four
isolated shards and strict exact-once merge. Every seven-sample rank/margin prefix, normalized root
identity and classifier membership must remain unchanged.

At 15 samples apply the frozen classifier audit exactly once. Passing requires both: the matched
class has at least seven decisive and seven alternate-positive roots, zero static-positive roots and
two-sided exact sign `p <= 0.025`; the unmatched class has zero alternate-positive roots. Failure of
either class rejects the classifier and leaves the static online policy unchanged. Do not relax the
gate, retune the threshold, discard a root or open the promotion holdout after seeing the result.
