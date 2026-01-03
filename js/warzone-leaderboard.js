console.log("🧠 Warzone Leaderboard JS loaded");

/* =============================
   IMPORTS (READ ONLY)
============================= */

import { dbPublic as db } from "./firebase-public.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =============================
   ENTRY
============================= */

initWarzoneLeaderboard();

async function initWarzoneLeaderboard() {
  console.log("🚀 Initializing Warzone Leaderboard");

  const players = await loadLeaderboardPlayers();

  console.log("👥 Players loaded:", players.length);

  // ✅ STOP HERE — Step 1 ends here
  // Step 2 will aggregate warzones
}

/* =============================
   DATA INTAKE (READ ONLY)
============================= */

async function initWarzoneLeaderboard() {
  console.log("🚀 Initializing Warzone Leaderboard");

  const players = await loadLeaderboardPlayers();
  console.log("👥 Players loaded:", players.length);

  const warzones = aggregateWarzones(players);
  console.log("🌍 Warzones found:", warzones.length);

  const computed = warzones.map(wz =>
    computeLwsRawScore(wz)
  );

  console.log("🧠 Sample warzone (debug):", computed[0]);

  // ✅ STOP HERE — Step 2 complete
}

function computeEffectivePower(rawPower) {
  // Non-linear dominance curve
  // High power scales disproportionately
  // Tunable later, structure locked
  return Math.pow(rawPower, 1.08);
}




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
function computeDepthAdjustment(sortedPlayers) {
  if (sortedPlayers.length === 0) return 0;

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

  const depthSignal = (R20 + R50 + R100 + R130) / 4;

  const baseline = 0.25;
  let adjustment = depthSignal - baseline;

  // Clamp to ±15%
  adjustment = Math.max(-0.15, Math.min(0.15, adjustment));

  return adjustment;
}
function computeLwsRawScore(warzone) {
  // Sort players by raw power desc
  const sortedPlayers = [...warzone.players].sort(
    (a, b) => b.power - a.power
  );

  const depthAdjustment = computeDepthAdjustment(sortedPlayers);

  const lwsRaw =
    warzone.primaryScore * (1 + depthAdjustment);

  return {
    ...warzone,
    playerCount: sortedPlayers.length,
    sortedPlayers,
    depthAdjustment,
    lwsRaw
  };
}
