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
// GLOBAL PLAYER CACHE (ADMIN)
// -----------------------------
let ALL_SERVER_PLAYERS = [];



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

function formatDateTime(ts) {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}
// -----------------------------
// POWER PLAUSIBILITY CHECK
// -----------------------------
// Rules:
// - Growth allowed: up to MAX_WEEKLY_GROWTH per week
// - Growth window capped (prevents absurd old data assumptions)
// - Large sudden drops are rejected
// - Time-aware using excel upload timestamp
// -----------------------------

const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

// Tunables (safe defaults)
const MAX_WEEKLY_GROWTH = 0.07;   // 7% per week
const MAX_ALLOWED_DROP = 0.25;    // 25% sudden drop
const MAX_GROWTH_WEEKS = 12;      // cap growth window (≈3 months)

function isPowerPlausible({
  excelPower,
  candidatePower,
  excelCreatedAt
}) {
  // ❌ Missing or invalid data
  if (
    !excelPower ||
    !candidatePower ||
    !excelCreatedAt?.toDate
  ) {
    return false;
  }

  // -----------------------------
  // TIME DELTA
  // -----------------------------
  const now = Date.now();
  const createdAtMs = excelCreatedAt.toDate().getTime();

  const weeksOld = Math.max(
    0,
    Math.floor((now - createdAtMs) / MS_PER_WEEK)
  );

  // Cap growth window to avoid unrealistic long-term assumptions
  const effectiveWeeks = Math.min(
    weeksOld,
    MAX_GROWTH_WEEKS
  );

  // -----------------------------
  // GROWTH CALCULATION
  // -----------------------------
  const maxGrowthAllowed =
    effectiveWeeks * MAX_WEEKLY_GROWTH;

  const deltaPct =
    (candidatePower - excelPower) / excelPower;

  // -----------------------------
  // HARD REJECTIONS
  // -----------------------------

  // ❌ Unrealistic sudden power loss
  if (deltaPct < -MAX_ALLOWED_DROP) {
    return false;
  }

  // ❌ Unrealistic power growth
  if (deltaPct > maxGrowthAllowed) {
    return false;
  }

  // ✅ Plausible match
  return true;
}
// Load all players once for manual search
const snap = await getDocs(collection(db, "server_players"));
ALL_SERVER_PLAYERS = snap.docs.map(d => ({
  id: d.id,
  name: d.data().name || "",
  power: d.data().totalPower || 0,
  warzone: d.data().warzone
}));


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
   snap.forEach(conflictDoc => {
    conflictIndex++;

      const c = conflictDoc.data()

      const uploadId = c.uploadId || "legacy";

      const card = document.createElement("div");
      card.className = "conflict-card";
      const plausibleCandidates = (c.candidates || [])
  .filter(p =>
    isPowerPlausible({
      excelPower: c.excelPower,
      candidatePower: p.power,
      excelCreatedAt: c.createdAt
    })
  )
  .sort((a, b) => {
    const da = Math.abs(a.power - c.excelPower);
    const db = Math.abs(b.power - c.excelPower);
    return da - db;
  });


      card.innerHTML = `
      <div class="conflict-header" data-toggle>
        <span class="conflict-number">${conflictIndex}</span>

        <span class="badge reason ${c.reason}">
          ${c.reason === "NAME_MISMATCH" ? "Name mismatch" : "Ambiguous"}
        </span>
     <div class="upload-meta">
  <span class="badge upload">
    ${c.uploadId || "legacy"}
  </span>
  <span class="upload-time">
    ${formatDateTime(c.createdAt)}
  </span>
  </div>

  <div class="conflict-meta">
  <div class="excel-row">
    <strong>Excel:</strong>
    <span class="excel-name">${c.excelName}</span>
    •
    <span class="excel-power">${formatPowerM(c.excelPower)}</span>
  </div>

  <div class="context-row">
    WZ ${c.warzone} • ${c.alliance || "—"}
  </div>
  </div>


    <span class="chevron">▸</span>
      </div>

      <div class="conflict-body hidden">
       <div class="conflict-candidates">
       

  ${
    plausibleCandidates.length
      ? plausibleCandidates.map((p, i) => {
  const deltaPct =
    (p.power - c.excelPower) / c.excelPower;
const now = Date.now();
const createdAtMs = c.createdAt?.toDate?.().getTime() || now;
const weeksOld = Math.max(
  0,
  Math.floor((now - createdAtMs) / MS_PER_WEEK)
);

const effectiveWeeks = Math.min(weeksOld, MAX_GROWTH_WEEKS);
const uiMaxGrowthAllowed = effectiveWeeks * MAX_WEEKLY_GROWTH;

let deltaClass = "delta-ok";
let deltaLabel = "Within expected growth";

if (deltaPct > uiMaxGrowthAllowed * 0.85) {
  deltaClass = "delta-border";
  deltaLabel = "High growth — review";
}

if (deltaPct < 0) {
  deltaClass = "delta-drop";
  deltaLabel = "Power drop";
}


          return `
            <label class="candidate selectable ${i === 0 ? "best-match" : ""}">

              <input type="radio" name="pick-${conflictDoc.id}" value="${p.id}" />
              <span class="name">${p.name}</span>
              <span class="meta">
                ${formatPowerM(p.power)}
                <span 
                class="delta ${deltaClass}"
                 title="${deltaLabel}"
                 >
            (${deltaPct > 0 ? "+" : ""}${Math.round(deltaPct * 100)}%)
            </span>

              </span>
            </label>
            `;
        }).join("")
      :      "<div class='candidate none'>No plausible matches (power mismatch)</div>"
  }
</div>


    <!-- 🔍 MANUAL SEARCH SELECT -->
  <div class="manual-select">
    <button class="manual-toggle">
      🔍 Search existing players
    </button>

    <div class="manual-panel hidden">
      <input
        type="text"
        class="manual-search"
        placeholder="Type player name…"
        autocomplete="off"
      />
      <div class="manual-results"></div>
    </div>
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
// -----------------------------
// MANUAL SEARCH TOGGLE
// -----------------------------
// -----------------------------
// MANUAL SEARCH (PER CONFLICT)
// -----------------------------
const manualToggle = card.querySelector(".manual-toggle");
const manualPanel = card.querySelector(".manual-panel");
const manualSearch = card.querySelector(".manual-search");
const manualResults = card.querySelector(".manual-results");

// Holds selected player for this conflict
let selectedServerDocId = null; // unified selection


// Toggle open / close
manualToggle.addEventListener("click", () => {
  manualPanel.classList.toggle("hidden");
});

// Search input
manualSearch.addEventListener("input", () => {
  const q = manualSearch.value.trim().toLowerCase();
  manualResults.innerHTML = "";

  if (q.length < 2) return;

  const matches = ALL_SERVER_PLAYERS
    .filter(p =>
      p.name.toLowerCase().includes(q) &&
      p.warzone === c.warzone
    )
    .slice(0, 10);

  if (!matches.length) {
    manualResults.innerHTML =
      "<div class='manual-empty'>No matches</div>";
    return;
  }

  matches.forEach(p => {
    const row = document.createElement("div");
    row.className = "manual-row";
    row.innerHTML = `
      <span class="name">${p.name}</span>
      <span class="meta">
        ${formatPowerM(p.power)} • WZ ${p.warzone}
      </span>
    `;

 row.onclick = () => {
  // Clear manual highlights
  manualResults
    .querySelectorAll(".manual-row")
    .forEach(r => r.classList.remove("selected"));

  // Clear radio selection (if any)
  card
    .querySelectorAll(".conflict-candidates input[type=radio]")
    .forEach(r => (r.checked = false));

  row.classList.add("selected");

  // 🔗 Unified selection
  selectedServerDocId = p.id;

  console.log("Selected (manual):", selectedServerDocId);

};


    manualResults.appendChild(row);
  });
});


// -----------------------------
// RADIO → UNIFIED SELECTION
// -----------------------------
card
  .querySelectorAll(".conflict-candidates input[type=radio]")
  .forEach(radio => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;

      // Clear manual search highlights
      manualResults
        .querySelectorAll(".manual-row")
        .forEach(r => r.classList.remove("selected"));

      // Close manual panel (UX clean)
      manualPanel.classList.add("hidden");

      // 🔗 Unified selection
      selectedServerDocId = radio.value;

      console.log("Selected (radio):", selectedServerDocId);


    });



    });





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
// IGNORE CONFLICT
// =============================
if (btn.dataset.action === "ignore") {
  const ok = confirm(
    "Ignore this conflict?\n\n" +
    "• No player will be changed\n" +
    "• Conflict will be marked resolved"
  );

  if (!ok) return;

  await updateDoc(conflictDoc.ref, {
    status: "resolved",
    resolution: "ignored",
    resolvedAt: serverTimestamp()
  });

  alert("Conflict ignored");
  loadConflicts();
  return;
}

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

// Load all players ONCE for manual search
const snap = await getDocs(collection(db, "server_players"));
ALL_SERVER_PLAYERS = snap.docs.map(d => ({
  id: d.id,
  name: d.data().name || "",
  power: d.data().totalPower || 0,
  warzone: d.data().warzone
}));

// Now load conflicts
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
