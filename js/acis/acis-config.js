/* ======================================================
   ACIS v1.1 — CONFIGURATION (LOCKED CONSTANTS)
   ------------------------------------------------------
   ⚠️ DO NOT ADD LOGIC HERE
   ⚠️ ONLY TUNABLE CONSTANTS
   ⚠️ MUST MATCH ACIS_v1.1_SPEC.md
====================================================== */

/* =============================
   POWER CLASS THRESHOLDS (M)
   ============================= */
export const POWER_CLASSES = {
  MEGA_WHALE: { min: 230_000_000 },
  WHALE:      { min: 180_000_000, max: 229_999_999 },
  SHARK:      { min: 160_000_000, max: 179_999_999 },
  PIRANHA:    { min: 140_000_000, max: 159_999_999 },
  SHRIMP:     { min: 130_000_000, max: 139_999_999 },
  KRILL:      { max: 129_999_999 }
};

/* =============================
   BASE CLASS WEIGHTS
   (Dual Weighting — Coarse)
   ============================= */
export const CLASS_BASE_WEIGHTS = {
  MEGA_WHALE: 1.30,
  WHALE:      1.15,
  SHARK:      1.00,
  PIRANHA:    0.85,
  SHRIMP:     0.70,
  KRILL:      0.40,
  PLANKTON:   0.20   // Assumed only
};

/* =============================
   POWER POSITION FACTOR
   (Dual Weighting — Fine)
   ============================= */
export const POSITION_FACTOR = {
  MIN: 0.90,
  MAX: 1.10
};

/* =============================
   ACTIVE / BENCH LIMITS
   ============================= */
export const ACTIVE_SQUAD_SIZE = 20;
export const BENCH_SIZE = 10;
export const MAX_ANALYZED_PLAYERS = 30;

/* =============================
   WARZONE ASSUMPTION LOGIC
   ============================= */
export const ASSUMPTION_FACTOR = 0.85; // WFP × factor

/* =============================
   COMPOSITION QUALITY SCORE
   ============================= */
export const CQS_WEIGHTS = {
  MEGA_WHALE: 6,
  WHALE:      6,
  SHARK:      4,
  PIRANHA:    2,
  SHRIMP:    -1,
  KRILL:     -3,
  PLANKTON:  -6
};

/* =============================
   STABILITY PENALTIES (%)
   ============================= */
export const STABILITY_PENALTIES = {
  ACTIVE_LESS_20: 20,
  ACTIVE_LESS_16: 40,
  PLANKTON_30PCT: 50,
  TOP3_50PCT:     15
};

export const STABILITY_FACTOR_LIMITS = {
  MIN: 0.30,
  MAX: 1.00
};

/* =============================
   ABSOLUTE SCORE WEIGHTS
   ============================= */
export const ACS_WEIGHTS = {
  ACTIVE: 0.70,
  BENCH:  0.30
};

/* =============================
   RELATIVE TIER IMPACT (%)
   ============================= */
export const TIER_IMPACT = {
  WHALE:   0.08,
  SHARK:   0.06,
  PIRANHA: 0.04,
  SHRIMP:  0.02,
  KRILL:   0.03
};

export const TIER_IMPACT_CAP = 0.25;

/* =============================
   NON-COMPETITIVE ALLIANCE
   ============================= */
export const NCA_RULES = {
  MIN_REAL_ACTIVE: 16,
  PLANKTON_LIMIT_PCT: 0.30,
  NCA_MULTIPLIER: 0.25
};

/* =============================
   OUTCOME RATIO BANDS
   ============================= */
export const OUTCOME_BANDS = [
  { min: 1.35, label: "Dominates" },
  { min: 1.15, label: "Strong Advantage" },
  { min: 0.95, label: "Evenly Matched" },
  { min: 0.75, label: "Outmatched" },
  { min: 0.00, label: "Collapse Likely" }
];
POWER_CLASSES.SHADOW = { min: 0, max: Infinity };

CLASS_BASE_WEIGHTS.SHADOW = 0.85;
