console.log("🧠 Warzone Leaderboard JS loaded");

import { dbPublic as db } from "./firebase-public.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initWarzoneLeaderboard();

async function initWarzoneLeaderboard() {
  console.log("🚀 Initializing Warzone Leaderboard");

  const players = await loadLeaderboardPlayers();
  console.log("👥 Players loaded:", players.length);

  // STOP HERE — next step will aggregate
}

async function loadLeaderboardPlayers() {
  console.log("📥 Loading players (read-only)");

  const snap = await getDocs(collection(db, "server_players"));
  const players = [];

  snap.forEach(doc => {
    const d = doc.data();
    if (!d.warzone || !d.power) return;

    players.push({
      id: doc.id,
      name: d.name || "Unknown",
      alliance: d.alliance || "UNASSIGNED",
      warzone: d.warzone,
      power: Number(d.power),
      lastConfirmedAt: d.lastConfirmedAt || null,
      g1: d.g1 || null
    });
  });

  return players;
}
