// =============================
// ADMIN — EXCEL CONFLICTS (READ-ONLY)
// =============================
import {
  getOrCreateIdentity,
  linkServerPlayer
} from "./admin-player-identity.js";

import { db, auth } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
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
const reasonInput = document.getElementById("filterReason");
const uploadInput = document.getElementById("filterUpload");




// -----------------------------
// STATE
// -----------------------------
let LATEST_UPLOAD_ID = null;



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
    const reason = reasonInput.value.trim(); // 👈 ADD THIS LINE
    const uploadMode = uploadInput.value;

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

    if (reason) {
  constraints.unshift(
    where("reason", "==", reason)
  );
    }

    if (uploadMode === "latest" && LATEST_UPLOAD_ID) {
  constraints.unshift(
    where("uploadId", "==", LATEST_UPLOAD_ID)
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
    let conflictIndex = 0;
   snap.forEach(doc => {
    conflictIndex++;

  const c = doc.data();
  const uploadId = c.uploadId || "legacy";

  const card = document.createElement("div");
  card.className = "conflict-card";

  card.innerHTML = `
  <div class="conflict-header" data-toggle>
    <span class="conflict-number">${conflictIndex}</span>

    <span class="badge reason ${c.reason}">
      ${c.reason === "NAME_MISMATCH" ? "Name mismatch" : "Ambiguous"}
    </span>
    <span class="badge upload">
  ${c.uploadId || "legacy"}
</span>

    <span class="meta">
      WZ ${c.warzone} • ${c.alliance || "—"}
    </span>

    <span class="chevron">▸</span>
  </div>

  <div class="conflict-body hidden">
    <div class="conflict-candidates">
      ${c.candidates && c.candidates.length
        ? c.candidates.map(p => `
          <label class="candidate selectable">
            <input type="radio" name="pick-${doc.id}" value="${p.id}" />
            <span class="name">${p.name}</span>
            <span class="meta">
              ${formatPowerM(p.power)}
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
  </div>
    `;

const header = card.querySelector("[data-toggle]");
const body = card.querySelector(".conflict-body");
const chevron = card.querySelector(".chevron");



header.addEventListener("click", () => {
  // close all others
  document.querySelectorAll(".conflict-body").forEach(b => {
    if (b !== body) b.classList.add("hidden");
  });

  document.querySelectorAll(".chevron").forEach(c => {
    if (c !== chevron) c.textContent = "▸";
  });

  // toggle this one
  const isOpen = !body.classList.contains("hidden");
  body.classList.toggle("hidden");
  chevron.textContent = isOpen ? "▸" : "▾";
});


  // ✅ ACTION PLACEHOLDERS (LOG ONLY)
    card.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", async () => {


    // =============================
    // USE EXISTING PLAYER (LOG ONLY)
    // =============================
   if (btn.dataset.action === "use-existing") {
  const picked = card.querySelector(
    `input[name="pick-${conflictDoc.id}"]:checked`
  );

  if (!picked) {
    alert("Please select a player first");
    return;
  }

 // 🔐 CONFIRM ACTION
const selectedPlayerName =
  picked
    .closest("label")
    ?.querySelector(".name")
    ?.textContent || "selected player";

const ok = confirm(
  `Use existing player?\n\n` +
  `Excel name: ${c.excelName}\n` +
  `Linked to: ${selectedPlayerName}\n\n` +
  `This will NOT rename or change power.\n` +
  `This only remembers identity.`
);

if (!ok) return;


  // 🔽 EXISTING CODE (DO NOT MOVE)
  const chosenServerDocId = picked.value;

  const { playerId } = await getOrCreateIdentity({
    canonicalName: c.excelName,
    warzone: c.warzone
  });

  await linkServerPlayer({
    playerId,
    serverDocId: chosenServerDocId,
    name: c.excelName,
    source: "excel-conflict"
  });

  await updateDoc(conflictDoc.ref, {
    status: "resolved",
    resolvedAt: serverTimestamp(),
    resolution: "use-existing",
    resolvedPlayer: chosenServerDocId
  });

  alert("✅ Conflict resolved & identity linked");
  loadConflicts();
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
    uploadInput.addEventListener(
  "change",
  debounce(loadConflicts, 200)
);

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

const guide = document.getElementById("conflictGuide");
const toggleBtn = document.getElementById("toggleGuide");

if (guide && toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    const body = guide.querySelector(".guide-body");
    const isHidden = body.style.display === "none";

    body.style.display = isHidden ? "block" : "none";
    toggleBtn.textContent = isHidden ? "▼" : "▲";
  });
}
