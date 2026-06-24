---
status: accepted
---

# Section scoring moves to a continuous cross-strategy RRF axis

Supersedes [ADR 0001](0001-topic-descent-scores-stay-internal.md).

To use lexical and semantic search systematically (a strong specific-term FTS hit
must never be discarded or buried) and to let multi-strategy agreement raise
confidence, we score each evidence **section** by a **global Reciprocal Rank
Fusion** over all retrieval strategies treated as *independent ranked inputs* —
full-text, vector, topic-descent, and outlier — rather than the coarse
"how many front-ends overlapped" tier of ADR 0001 (which discarded the search
scores and lumped FTS+vector into one "hybrid search" front-end). Escalation tiers
derive from this continuous score (consensus-floor: found by ≥2 strategies, or a
single strategy at top rank).

## Considered Options

- **Keep ADR 0001** (cross-front-end overlap tiers; topic scores internal; FTS+vector
  fused, scores discarded). Rejected: it loses the strong single-strategy
  specific-term hit and cannot express graded multi-strategy agreement — the two
  things this redesign exists to fix.

## Consequences

- ADR 0001's core concern — *topic's within-method signal must not contaminate the
  cross-method precision tier* — is **preserved by other means**: topic and outlier
  contribute as **down-weighted (half-vote) corroborators** (topic+outlier alone is
  never tier-1), and topic-descent is **deferred off the hot path**, so in the common
  case tier-1 is FTS×vector cross-method corroboration. What changes is the
  *mechanism* (continuous RRF), not the precision principle.
- Reverses ADR 0001's "topic-descent scores stay internal": topic now contributes
  (down-weighted) to the global section score. A future reader expecting the
  internal-only rule should read this ADR.
- ADR 0002 (grounded facts are atomic and single-document) is unaffected.
</content>
