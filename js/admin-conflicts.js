import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const listEl = document.getElementById("conflictList");

async function loadConflicts() {
  listEl.innerHTML = "Loading…";

  const q = query(
    collection(db, "excel_conflicts"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    listEl.innerHTML = "<p>No pending conflicts 🎉</p>";
    return;
  }

  listEl.innerHTML = "";

  snap.forEach(doc => {
    const c = doc.data();

    const div = document.createElement("div");
    div.className = "conflict-card";

    div.innerHTML = `
      <div class="conflict-header">
        <strong>${c.excelName}</strong>
        <span>⚡ ${Math.round(c.excelPower / 1e6)}M</span>
      </div>

      <div class="conflict-meta">
        WZ ${c.warzone} • ${c.alliance} • ${c.reason}
      </div>

      <div class="conflict-candidates">
        ${c.candidates.map(p => `
          <div class="candidate">
            ${p.name} — ${Math.round(p.power / 1e6)}M
          </div>
        `).join("")}
      </div>
    `;

    listEl.appendChild(div);
  });
}

loadConflicts();
