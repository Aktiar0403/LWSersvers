/* ======================================================
   ACIS v1.2 — CORE ENGINE (PART 1)
   ------------------------------------------------------
   - Classifies players
   - Applies dual weighting
   - Injects Plankton
   - Computes effective power
   - Computes First Squad Power (FSP)
   - NO matchup logic
====================================================== */

import {
  POWER_CLASSES,
  CLASS_BASE_WEIGHTS,
  POSITION_FACTOR,
  ACTIVE_SQUAD_SIZE,
  ASSUMPTION_FACTOR
} from "./acis-config.js";

/* =============================
   FIRST SQUAD POWER (FSP)
   Empirical, non-linear estimate
============================= */
function estimateFirstSquadPower(effectivePower) {
  const tp = Number(effectivePower || 0);


  if (tp <= 150e6) return tp * 0.37;
  if (tp <= 220e6) return tp * 0.34;
  if (tp <= 320e6) return tp * 0.30;
  return tp * 0.27;
}

/* =============================
   CLASSIFY PLAYER BY POWER
============================= */
function classifyPower(power) {
  if (power >= POWER_CLASSES.MEGA_WHALE.min) return "MEGA_WHALE";
  if (power >= POWER_CLASSES.WHALE.min) return "WHALE";
  if (power >= POWER_CLASSES.SHARK.min) return "SHARK";
  if (power >= POWER_CLASSES.PIRANHA.min) return "PIRANHA";
  if (power >= POWER_CLASSES.SHRIMP.min) return "SHRIMP";
  return "KRILL";
}

/* =============================
   POWER POSITION FACTOR
============================= */
function computePositionFactor(power, cls) {
  if (cls === "PLANKTON") return 1;

  const ranges = POWER_CLASSES[cls];
  if (!ranges || !ranges.min || !ranges.max) return 1;

  const ratio =
    (power - ranges.min) / (ranges.max - ranges.min);

  return (
    POSITION_FACTOR.MIN +
    ratio * (POSITION_FACTOR.MAX - POSITION_FACTOR.MIN)
  );
}

/* =============================
   EFFECTIVE POWER CALCULATION
============================= */
function computeCombatPower(player, cls) {
  const raw = player.effectivePower;

  const base = CLASS_BASE_WEIGHTS[cls];
  const pos = computePositionFactor(raw, cls);

  return raw * base * pos;
}

/* =============================
   CREATE PLANKTON PLAYER
============================= */
function createPlankton(warzoneFloorPower) {
  const rawPower = warzoneFloorPower * ASSUMPTION_FACTOR;

 const eff = rawPower * CLASS_BASE_WEIGHTS.PLANKTON;

return {
  name: "Assumed",
  effectivePower: eff,
  class: "PLANKTON",
  firstSquadPower: eff * 0.33
};

}

/* =============================
   PROCESS SINGLE ALLIANCE
============================= */
export function processAlliance(allianceData) {
  const {
    alliance,
    warzone,
    activeReal,
    benchReal,
    missingActiveCount,
    benchAvailable,
    warzoneFloorPower
  } = allianceData;

  const tierCounts = {
    MEGA_WHALE: 0,
    WHALE: 0,
    SHARK: 0,
    PIRANHA: 0,
    SHRIMP: 0,
    KRILL: 0,
    PLANKTON: 0
  };

  const activePlayers = [];
  const benchPlayers = [];

  let activePower = 0;
  let benchPower = 0;
  let activeFirstSquadPower = 0;

  /* -------- ACTIVE REAL PLAYERS -------- */
  activeReal.forEach(p => {
   const cls = classifyPower(p.effectivePower);
const eff = computeCombatPower(p, cls);
const fsp = estimateFirstSquadPower(p.effectivePower);

    tierCounts[cls]++;
    activePower += eff;
    activeFirstSquadPower += fsp;

    activePlayers.push({
      ...p,
      class: cls,
      effectivePower: eff,
      firstSquadPower: fsp,
      assumed: false
    });
  });

  /* -------- PLANKTON FILL (MISSING) -------- */
  const activeRealCount = activeReal.length;

const strongCtx = {
  warzoneFloorPower,
  averageFirstSquadPower:
    activeReal.length
      ? activeReal.reduce((s, p) => s + estimateFirstSquadPower(p.effectivePower), 0) / activeReal.length
      : 0,
  activeRealCount,
  missingActiveCount
};

const useShadow = isStrongWarzone(strongCtx);

for (let i = 0; i < missingActiveCount; i++) {
  const filler = useShadow
    ? createShadowPlayer(warzoneFloorPower)
    : createPlankton(warzoneFloorPower);

  tierCounts[filler.class]++;
  activePower += filler.effectivePower;
  activeFirstSquadPower += filler.firstSquadPower;

  activePlayers.push(filler);
}


  /* -------- BENCH (REAL ONLY) -------- */
  if (benchAvailable) {
    benchReal.forEach(p => {
    const cls = classifyPower(p.effectivePower);
const eff = computeCombatPower(p, cls);


      tierCounts[cls]++;
      benchPower += eff;

      benchPlayers.push({
        ...p,
        class: cls,
        effectivePower: eff,
        firstSquadPower: estimateFirstSquadPower(p.totalPower),
        assumed: false
      });
    });
  }

  return {
    alliance,
    warzone,

    activePlayers,
    benchPlayers,

    activePower,
    benchPower,

    /* 🔑 NEW — FSP METRICS */
    activeFirstSquadPower,
    averageFirstSquadPower:
      activePlayers.length
        ? activeFirstSquadPower / activePlayers.length
        : 0,

    tierCounts
  };
}
