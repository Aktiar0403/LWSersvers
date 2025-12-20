/* ======================================================
   ACIS v1.1 — CORE ENGINE (PART 2: SCORER)
   ------------------------------------------------------
   - Computes CQS
   - Applies stability penalties
   - Detects NCA
   - Computes Absolute Combat Score (ACSₐ)
   - NO matchup logic
====================================================== */

import {
  CQS_WEIGHTS,
  STABILITY_PENALTIES,
  STABILITY_FACTOR_LIMITS,
  ACS_WEIGHTS,
  NCA_RULES
} from "./acis-config.js";

/* =============================
   COMPOSITION QUALITY SCORE
============================= */
function computeCQS(tierCounts) {
  let score = 0;

  Object.keys(CQS_WEIGHTS).forEach(cls => {
    score += (tierCounts[cls] || 0) * CQS_WEIGHTS[cls];
  });

  // Normalize to 0–100 (safe clamp)
  return Math.max(0, Math.min(100, score));
}

/* =============================
   STABILITY FACTOR
============================= */
function computeStabilityFactor(processed) {
  let penalty = 0;

  const realActiveCount =
    processed.activePlayers.filter(p => !p.assumed).length;

  const planktonCount =
    processed.tierCounts.PLANKTON || 0;

  const planktonPct =
    planktonCount / processed.activePlayers.length;

  if (realActiveCount < 20) penalty += STABILITY_PENALTIES.ACTIVE_LESS_20;
  if (realActiveCount < 16) penalty += STABILITY_PENALTIES.ACTIVE_LESS_16;
  if (planktonPct >= NCA_RULES.PLANKTON_LIMIT_PCT)
    penalty += STABILITY_PENALTIES.PLANKTON_30PCT;

  // Top-3 concentration
  const top3 = [...processed.activePlayers]
    .filter(p => !p.assumed)
    .sort((a, b) => b.effectivePower - a.effectivePower)
    .slice(0, 3);

  const top3Power = top3.reduce((s, p) => s + p.effectivePower, 0);
  const activePower = processed.activePower || 1;

  if (top3Power / activePower >= 0.5)
    penalty += STABILITY_PENALTIES.TOP3_50PCT;

  const factor =
    1 - penalty / 100;

  return Math.max(
    STABILITY_FACTOR_LIMITS.MIN,
    Math.min(STABILITY_FACTOR_LIMITS.MAX, factor)
  );
}

/* =============================
   NON-COMPETITIVE ALLIANCE
============================= */
function detectNCA(processed) {
  const realActiveCount =
    processed.activePlayers.filter(p => !p.assumed).length;

  const planktonCount =
    processed.tierCounts.PLANKTON || 0;

  const planktonPct =
    planktonCount / processed.activePlayers.length;

  return (
    realActiveCount < NCA_RULES.MIN_REAL_ACTIVE ||
    planktonPct >= NCA_RULES.PLANKTON_LIMIT_PCT
  );
}

/* =============================
   ABSOLUTE COMBAT SCORE
============================= */
function computeACSAbsolute(processed, cqs, stabilityFactor) {
  const weightedPower =
    processed.activePower * ACS_WEIGHTS.ACTIVE +
    processed.benchPower * ACS_WEIGHTS.BENCH;

  return (
    weightedPower *
    (1 + cqs / 100) *
    stabilityFactor
  );
}

/* =============================
   FINAL SCORING PIPELINE
============================= */
export function scoreAlliance(processed) {
  const cqs = computeCQS(processed.tierCounts);
  const stabilityFactor = computeStabilityFactor(processed);
  const isNCA = detectNCA(processed);

  let acsAbsolute =
    computeACSAbsolute(processed, cqs, stabilityFactor);

  if (isNCA) {
    acsAbsolute *= NCA_RULES.NCA_MULTIPLIER;
  }

  return {
  alliance: processed.alliance,
  warzone: processed.warzone,

  // 🔑 REQUIRED FOR UI
  activePlayers: processed.activePlayers,
  benchPlayers: processed.benchPlayers,
activeFirstSquadPower: processed.activeFirstSquadPower,
averageFirstSquadPower: processed.averageFirstSquadPower,

  activePower: processed.activePower,
  benchPower: processed.benchPower,

  cqs,
  stabilityFactor,
  isNCA,

  acsAbsolute,

  tierCounts: processed.tierCounts
};
}