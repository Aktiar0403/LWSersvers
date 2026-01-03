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

async function loadLeaderboardPlayers() {
  console.log("📥 Loading players from server_players (read-only)");

  const snap = await getDocs(collection(db, "server_players"));
  const players = [];

  snap.forEach(doc => {
    const d = doc.data();

    // ✅ Correct schema mapping
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
