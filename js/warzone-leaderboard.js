console.log("🧠 Warzone Leaderboard JS loaded");

/* =====================================================
   IMPORTS — PUBLIC, READ-ONLY
===================================================== */

import { dbPublic as db } from "./firebase-public.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================================================
   ENTRY POINT
===================================================== */

initWarzoneLeaderboard();

/* =====================================================
   MAIN INITIALIZER
   - Step 1: Load players
   - Step 2: Aggregate warzones + compute LWS raw score
===================================================== */

async function initWarzoneLeaderboard() {
  console.log("🚀 Initializing Warzone Leaderboard");

  /* ---------- STEP 1: LOAD PLAYERS ---------- */
  const players = await loadLeaderboardPlayers();
  console.log("👥 Players loaded:", players.length);

  /* ---------- STEP 2: AGGREGATE WARZONES ---------- */
  const warzones = aggregateWarzones(players);
  console.log("🌍 Warzones found:", warzones.length);

  const computedWarzones = warzones.map(wz =>
    computeLwsRawScore(wz)
  );

  // Debug one warzone to verify everything
  console.log("🧠 Sample warzone (debug):", computedWarzones[0]);

  // ⛔ STOP HERE
  // STEP 3 (normalization + UI) will come later
}

/* =====================================================
   STEP 1 — DATA INTAKE (READ ONLY)
   Source: server_players (public-safe)
===================================================== */

async function loadLeaderboardPlayers() {
  console.log("📥 Loading players from server_players");

  const snap = await getDocs(collection(db, "server_players"));
  const players = [];

  snap.forEach(doc => {
    const d = doc.data();

    // server_players uses `totalPower`, not `power`
    const power = Number(d.totalPower);

    // Guard: must have warzone + valid power
    if (!d.warzone || isNaN(power)) return;

    players.push({
      id: doc.id,
      name: d.name || "Unknown",
      alliance: d.alliance || "UNASSIGNED",
      warzone: d.warzone,
      power, // normalized raw power
      basePower: d.basePower || null,
      lastConfirmedAt: d.lastConfirmedAt || null,
      g1: d.g1 || null
    });
  });

  return players;
}

/* =====================================================
   STEP 2A — NON-LINEAR INDIVIDUAL POWER
   Primary dominance driver
===================================================== */

function computeEffectivePower(rawPower) {
  // Non-linear scaling:
  // High power players dominate disproportionately
  // Exponent can be tuned later
  return Math.pow(rawPower, 1.08);
}

/* =====================================================
   STEP 2B — GROUP PLAYERS BY WARZONE
===================================================== */

function aggregateWarzones(players) {
  const warzones = new Map();

  for (const p of players) {
    if (!warzones.has(p.warzone)) {
      warzones.set(p.warzone, {
        warzone: p.warzone,
        players: [],
        totalPower: 0,
        primaryScore: 0
      });
    }

    const wz = warzones.get(p.warzone);

    wz.players.push(p);
    wz.totalPower += p.power;
    wz.primaryScore += computeEffectivePower(p.power);
  }

  return Array.from(warzones.values());
}

/* =====================================================
   STEP 2C — DEPTH HELPERS
   (P20 / P50 / P100 / P130)
===================================================== */

function getDepthPower(sortedPlayers, index) {
  if (!sortedPlayers || sortedPlayers.length === 0) return 0;

  // If enough players, take exact rank
  if (sortedPlayers.length >= index) {
    return sortedPlayers[index - 1].power;
  }

  // Otherwise take weakest available
  return sortedPlayers[sortedPlayers.length - 1].power;
}

/* =====================================================
   STEP 2D — DEPTH ADJUSTMENT (v2.1 LOCKED)
===================================================== */

function computeDepthAdjustment(sortedPlayers) {
  if (!sortedPlayers || sortedPlayers.length === 0) return 0;

  const P1 = sortedPlayers[0].power;
  if (P1 <= 0) return 0;

  const P20  = getDepthPower(sortedPlayers, 20);
  const P50  = getDepthPower(sortedPlayers, 50);
  const P100 = getDepthPower(sortedPlayers, 100);
  const P130 = getDepthPower(sortedPlayers, 130);

  const R20  = P20  / P1;
  const R50  = P50  / P1;
  const R100 = P100 / P1;
  const R130 = P130 / P1;

  // Equal-weight depth signal
  const depthSignal = (R20 + R50 + R100 + R130) / 4;

  const baseline = 0.25;
  let adjustment = depthSignal - baseline;

  // Hard clamp to ±15%
  adjustment = Math.max(-0.15, Math.min(0.15, adjustment));

  return adjustment;
}

/* =====================================================
   STEP 2E — FINAL LWS RAW SCORE (INTERNAL)
===================================================== */

function computeLwsRawScore(warzone) {
  // Sort players by raw power (desc)
  const sortedPlayers = [...warzone.players].sort(
    (a, b) => b.power - a.power
  );

  const depthAdjustment = computeDepthAdjustment(sortedPlayers);

  const lwsRaw =
    warzone.primaryScore * (1 + depthAdjustment);

  return {
    warzone: warzone.warzone,
    playerCount: sortedPlayers.length,
    totalPower: warzone.totalPower,
    primaryScore: warzone.primaryScore,
    depthAdjustment,
    lwsRaw,
    sortedPlayers // kept for next steps (tiers, P-values, UI)
  };
}
