# RHEA contract v1

The optimizer uses a deterministic seeded population of bounded macro genomes. Gene zero selects a
static-ranked root; later genes index current public legal candidates. Every genome uses common
opponent-belief samples. Elite retention, mutation, a unique-genome cache and static-order ties are
bounded by generations, evaluations and wall clock. Any incomplete generation, malformed score or
scenario failure falls back to static.

The official adapter executes clones, versioned opponent policies and the same public leaf evaluator
as Beam. Unit tests cover discovery, reproducibility and fail-closed paths. The official smoke
completes two generations, five unique genomes and ten scenario evaluations; its sanitized report is
byte-reproducible.

RHEA selects the same known harmful first-turn skip at score 39. The mechanism passes, playing
strength does not. Next audit paired hidden worlds, then impose equal one-/three-second budgets.
