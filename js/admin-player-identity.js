/* ======================================================
   ADMIN — PLAYER IDENTITY ENGINE
   ------------------------------------------------------
   - Canonical playerId (admin-only)
   - Name history
   - Explicit linking
   - NO automatic merges
====================================================== */

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function generatePlayerId() {
  return "pid_" + crypto.randomUUID();
}



export async function getOrCreateIdentity({
  canonicalName,
  warzone
}) {
  const playerId = generatePlayerId();
  const ref = doc(db, "player_identity", playerId);

  await setDoc(ref, {
    canonicalName,
    warzone,
    nameHistory: [],
    linkedDocs: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return {
    playerId,
    ref
  };
}


export async function linkServerPlayer({
  playerId,
  serverDocId,
  name,
  source = "manual"
}) {
  const ref = doc(db, "player_identity", playerId);

  await updateDoc(ref, {
    linkedDocs: arrayUnion(`server_players/${serverDocId}`),
nameHistory: arrayUnion({
  name,
  source,
  seenAt: Timestamp.now()
}),

    updatedAt: serverTimestamp()
  });
}
