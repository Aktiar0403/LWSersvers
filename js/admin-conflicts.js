// =============================
// ADMIN — EXCEL CONFLICTS (READ-ONLY)
// =============================

import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// -----------------------------
// DOM
// -----------------------------
const listEl = document.getElementById("conflictList");
const wzInput = document.getElementById("filterWarzone");
const alInput = document.getElementById("filterAlliance");

// -----------------------------
// UTIL
// -----------------------------
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function formatPowerM(p) {
  if (!p) return "—";
  return Math.round(p / 1e6) + "M";
}

// -----------------------------
// CORE LOADER
// -----------------------------
async function loadConflicts() {
  listEl.innerHTML = "<p>Loading conflicts…</p>";

  try {
    const constraints = [
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    ];

    // Optional filters
    const wz = wzInput.value.trim();
    const al = alInput.value.trim();

    if (wz) {
      constraints.unshift(
        where("warzone", "==", Number(wz))
      );
    }

    if (al) {
      constraints.unshift(
        where("alliance", "==", al)
      );
    }

    const q = query(
      collection(db, "excel_conflicts"),
      ...constraints
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML = "<p>No pending conflicts 🎉</p>";
      return;
    }

    listEl.innerHTML = "";

   snap.forEach(doc => {
  const c = doc.data();

  const card = document.createElement("div");
  card.className = "conflict-card";

  card.innerHTML = `
 <div class="conflict-candidates">
  ${c.candidates && c.candidates.length
    ? c.candidates.map(p => `
      <label class="candidate selectable">
        <input
          type="radio"
          name="pick-${doc.id}"
          value="${p.id}"
        />
        <span class="name">${p.name}</span>
        <span class="meta">
          ${formatPowerM(p.power)}
          ${p.hasPlayerId ? "• 🆔 linked" : ""}
        </span>
      </label>
    `).join("")
    : "<div class='candidate none'>No candidates</div>"
  }
</div>


    <div class="conflict-actions">
      <button data-action="use-existing">Use Existing</button>
      <button data-action="rename-existing">Rename Existing</button>
      <button data-action="create-new">Create New</button>
      <button data-action="ignore">Ignore</button>
    </div>
  `;

  // ✅ ACTION PLACEHOLDERS (LOG ONLY)
card.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", () => {

    // =============================
    // USE EXISTING PLAYER (LOG ONLY)
    // =============================
    if (btn.dataset.action === "use-existing") {
      const picked = card.querySelector(
        `input[name="pick-${doc.id}"]:checked`
      );

      if (!picked) {
        alert("Please select a player first");
        return;
      }

      console.log("✅ USE EXISTING selected", {
        conflictId: doc.id,
        playerId: picked.value,
        excelName: c.excelName,
        excelPower: c.excelPower,
        warzone: c.warzone,
        alliance: c.alliance
      });

      return;
    }

    // =============================
    // OTHER ACTIONS (PLACEHOLDER)
    // =============================
    console.log("🧠 Admin action clicked", {
      conflictId: doc.id,
      action: btn.dataset.action
    });
  });
});


  listEl.appendChild(card);
});

   } catch (err) {
    console.error("Failed to load conflicts:", err);
    listEl.innerHTML = "<p>Failed to load conflicts</p>";
  }
}

// -----------------------------
// FILTER EVENTS
// -----------------------------
[wzInput, alInput].forEach(inp => {
  if (!inp) return;
  inp.addEventListener("input", debounce(loadConflicts, 300));
});

// -----------------------------
// AUTH GUARD
// -----------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    document.body.innerHTML =
      "<h3>Unauthorized</h3><p>Please login as admin.</p>";
    return;
  }

  try {
    const token = await user.getIdTokenResult(true);
    if (!token.claims.admin) {
      document.body.innerHTML =
        "<h3>Admin access only</h3>";
      return;
    }

    // ✅ Admin confirmed
    loadConflicts();

  } catch (err) {
    console.error("Auth check failed:", err);
    document.body.innerHTML =
      "<h3>Authorization error</h3>";
  }
});