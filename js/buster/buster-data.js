import { db } from "../firebase-config.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { estimateFirstSquadPower } from "../acis/acis-engine.js";

export async function loadAlliancePlayers(allianceName) {
  const q = query(
    collection(db, "server_players"),
    where("alliance", "==", allianceName)
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => {
    const d = doc.data();
    const effectivePower = Number(d.basePower ?? d.totalPower ?? 0);

    return {
      id: doc.id,
      name: d.name || "Unknown",
      alliance: d.alliance,
      warzone: d.warzone,
      effectivePower,
      fsp: estimateFirstSquadPower(effectivePower),
      tier: d.tier || inferTier(effectivePower),
      isPresent: true
    };
  });
}

function inferTier(power) {
  if (power >= 300e6) return "whale";
  if (power >= 200e6) return "mega";
  if (power >= 120e6) return "frontline";
  return "depth";
}
