# RHEA context classifier validation, three-sample integrity stage

Collect exactly three paired continuations for all 12 roots frozen in v23, using four isolated
process shards. Preserve the frozen root identities, candidate order, class membership, continuation
policy and preregistered gate. This stage is an integrity checkpoint only: it may report directional
counts, but cannot accept or reject the classifier before 15 samples per root.

Merge only when shard target indices cover 0–11 exactly once. The merged report must retain all
frozen identities and classifier memberships, contain three completed continuations for both
candidates at every root, remain `collecting`, and keep the promotion holdout sealed.
