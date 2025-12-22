/* ======================================================
   ACIS v1.1 — DATA PREPARATION LAYER (RECTIFIED)
   ------------------------------------------------------
   ✔ Supports MULTIPLE warzones in one dataset
   ✔ Determines warzone PER ALLIANCE (dominant)
   ✔ Computes Warzone Floor Power (WFP) correctly
   ✔ Extracts Active / Bench (REAL players only)
   ✔ NO combat logic
====================================================== */

import {
  ACTIVE_SQUAD_SIZE,
  BENCH_SIZE,
  MAX_ANALYZED_PLAYERS
} from "./acis-config.js";
/* =============================
   PHASE 4 — EFFECTIVE POWER
============================= */
function getEffectivePower(p) {
  const base = Number(p.basePower ?? p.totalPower ?? 0);

  if (p.powerSource === "confirmed") return base;

  if (!p.lastConfirmedAt || !p.lastConfirmedAt.toMillis) {
    return base;
  }

  const weeks =
    Math.floor((Date.now() - p.lastConfirmedAt.toMillis()) / (1000 * 60 * 60 * 24 * 7));

  if (weeks <= 0) return base;

  let rate = 0.03;
  if (base >= 400_000_000) rate = 0.007;
  else if (base >= 200_000_000) rate = 0.018;
  else if (base >= 100_000_000) rate = 0.024;

  return Math.round(base * Math.pow(1 + rate, weeks));
}

/* =============================
   GROUP PLAYERS BY ALLIANCE
============================= */
function groupByAlliance(players) {
  const map = new Map();

  players.forEach(p => {
    if (!p.alliance) return;

    if (!map.has(p.alliance)) {
      map.set(p.alliance, []);
    }
    map.get(p.alliance).push(p);
  });

  return map;
}

/* =============================
   COMPUTE WARZONE FLOOR POWER
============================= */
function computeWarzoneFloor(players) {
  let min = Infinity;

  players.forEach(p => {
    const power = getEffectivePower(p);
    if (power > 0 && power < min) min = power;
  });

  return min === Infinity ? 0 : min;
}


/* =============================
   DETERMINE DOMINANT WARZONE
   (Most frequent among players)
============================= */
function determineAllianceWarzone(alliancePlayers) {
  const counts = {};

  alliancePlayers.forEach(p => {
    if (p.warzone == null) return;
    counts[p.warzone] = (counts[p.warzone] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/* =============================
   PREPARE ALL ALLIANCES
============================= */
export function prepareAllianceData(players) {
  if (!Array.isArray(players)) {
    throw new Error("prepareAllianceData expects an array");
  }

  // Group by alliance
  const allianceMap = groupByAlliance(players);
  const alliances = [];

  allianceMap.forEach((alliancePlayers, allianceName) => {

    /* ---------- WARZONE (PER ALLIANCE) ---------- */
    const warzone = determineAllianceWarzone(alliancePlayers);

    /* ---------- WARZONE FLOOR POWER ---------- */
    const warzonePlayers = players.filter(
      p => p.warzone === warzone
    );
    const warzoneFloorPower =
      computeWarzoneFloor(warzonePlayers);
alliancePlayers = alliancePlayers.map(p => ({
  ...p,
  effectivePower: getEffectivePower(p)
}));

    /* ---------- SORT PLAYERS BY POWER ---------- */
    const sorted = [...alliancePlayers].sort(
      (a, b) => (b.totalPower || 0) - (a.totalPower || 0)
    );

    /* ---------- SLICE TOP 30 ---------- */
    const top = sorted.slice(0, MAX_ANALYZED_PLAYERS);

    /* ---------- ACTIVE (REAL ONLY) ---------- */
    const activeReal = top.slice(0, ACTIVE_SQUAD_SIZE);

    /* ---------- BENCH (ONLY IF ACTIVE FULL) ---------- */
    const benchReal =
      activeReal.length === ACTIVE_SQUAD_SIZE
        ? top.slice(
            ACTIVE_SQUAD_SIZE,
            ACTIVE_SQUAD_SIZE + BENCH_SIZE
          )
        : [];

    /* ---------- MISSING ACTIVE COUNT ---------- */
    const missingActiveCount =
      ACTIVE_SQUAD_SIZE - activeReal.length;

    alliances.push({
      alliance: allianceName,
      warzone,

      playersSorted: sorted,

      activeReal,
      benchReal,

      missingActiveCount,
      benchAvailable: benchReal.length > 0,

      warzoneFloorPower
    });
  });

  return alliances;
}
function isStrongWarzone(ctx) {
  const {
    warzoneFloorPower,
    averageFirstSquadPower,
    activeRealCount,
    missingActiveCount
  } = ctx;

  const FSP_THRESHOLD = warzoneFloorPower * 0.55;

  const MIN_VISIBLE = Math.min(
    22,
    Math.max(15, Math.round(ACTIVE_SQUAD_SIZE * 0.6))
  );

  return (
    warzoneFloorPower > 0 &&
    averageFirstSquadPower >= FSP_THRESHOLD &&
    activeRealCount >= MIN_VISIBLE &&
    missingActiveCount > 0
  );
}

function createShadowPlayer(referencePower) {
  const inferred = referencePower * 0.85;

  return {
    name: "Shadow",
    effectivePower: inferred,
    class: "SHADOW",
    firstSquadPower: inferred * 0.28,
    assumed: true
  };
}
