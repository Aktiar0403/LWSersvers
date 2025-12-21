/* ======================================================
   ACIS v1.1 — MATCHUP ENGINE
   ------------------------------------------------------
   - Applies relative tier parity
   - Computes ACSᵣ
   - Determines outcome labels
====================================================== */

import {
  TIER_IMPACT,
  TIER_IMPACT_CAP,
  OUTCOME_BANDS
} from "./acis-config.js";

/* =============================
   COMPUTE TIER MODIFIER
============================= */
function computeTierModifier(a, b) {
  let modifier = 0;

  Object.keys(TIER_IMPACT).forEach(cls => {
    const aCount = a.tierCounts[cls] || 0;
    const bCount = b.tierCounts[cls] || 0;

    // Relative parity rule
    if (aCount === 0 && bCount === 0) return;

    const diff = aCount - bCount;
    modifier += diff * TIER_IMPACT[cls];
  });

  // Clamp modifier
  return Math.max(
    -TIER_IMPACT_CAP,
    Math.min(TIER_IMPACT_CAP, modifier)
  );
}

/* =============================
   COMPUTE RELATIVE SCORE
============================= */
function computeRelativeScore(alliance, modifier) {
  return alliance.acsAbsolute * (1 + modifier);
}

/* =============================
   DETERMINE OUTCOME LABEL
============================= */
function determineOutcome(ratio) {
  for (const band of OUTCOME_BANDS) {
    if (ratio >= band.min) return band.label;
  }
  return OUTCOME_BANDS[OUTCOME_BANDS.length - 1].label;
}

/* =============================
   MATCH TWO ALLIANCES
============================= */
export function matchupAlliances(a, b) {
  const modA = computeTierModifier(a, b);
  const modB = computeTierModifier(b, a);

  const scoreA = computeRelativeScore(a, modA);
  const scoreB = computeRelativeScore(b, modB);

  const ratio = scoreA / scoreB;
  const outcome = determineOutcome(ratio);

  return {
    a: a.alliance,
    b: b.alliance,

    scoreA,
    scoreB,

    ratio,
    outcome
  };
}

/* =============================
   BUILD FULL MATCHUP MATRIX
============================= */
export function buildMatchupMatrix(scoredAlliances) {
  const results = [];

  for (let i = 0; i < scoredAlliances.length; i++) {
    for (let j = i + 1; j < scoredAlliances.length; j++) {
      results.push(
        matchupAlliances(
          scoredAlliances[i],
          scoredAlliances[j]
        )
      );
    }
  }

  return results;
}
