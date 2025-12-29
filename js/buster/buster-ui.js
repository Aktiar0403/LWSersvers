console.log("🧨 Buster UI loaded");

/* =============================
   FIREBASE
============================= */
import { dbPublic as db } from "../firebase-public.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { estimateFirstSquadPower } from "../acis/acis-engine.js";
import { buildSyntheticCommanders } from "./synthetic-engine.js";

/* =============================
   DOM ELEMENTS
============================= */
const myAllianceInput = document.getElementById("myAllianceSearch");
const myAllianceResults = document.getElementById("myAllianceResults");

const oppAllianceInput = document.getElementById("oppAllianceSearch");
const oppAllianceResults = document.getElementById("oppAllianceResults");

const myPlayerSelect = document.getElementById("myPlayerSelect");


const computedFspValue = document.getElementById("computedFspValue");

const manualToggle = document.getElementById("manualFspToggle");
const manualInput = document.getElementById("manualFspInput");
const fspSourceNote = document.getElementById("fspSourceNote");

const canHandleEl = document.getElementById("canHandleCount");
const canStallEl = document.getElementById("canStallCount");
const avoidEl = document.getElementById("avoidCount");
const matchupModal = document.getElementById("matchupModal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const closeModalBtn = document.getElementById("closeModal");



const confidenceBadge = document.getElementById("confidenceBadge");

const advancedToggle = document.getElementById("advancedToggle");
const advancedPanel = document.getElementById("advancedPanel");

/* =============================
   STATE
============================= */
let ALL_PLAYERS = [];
let ALL_ALLIANCES = [];

let myAlliancePlayers = [];
let opponentPlayers = [];

/* =============================
   CONFIG
============================= */
const WARZONE_BASE_POWER = 130e6;
const MANUAL_FSP_CAP = 1.25;

/* =============================
   INIT
============================= */
init();

async function init() {
  const snap = await getDocs(collection(db, "server_players"));

  ALL_PLAYERS = snap.docs.map(d => {
    const x = d.data();
    const effectivePower = Number(x.basePower ?? x.totalPower ?? 0);

    return {
      id: d.id,
      name: x.name || "Unknown",
      alliance: x.alliance,
      fsp: estimateFirstSquadPower(effectivePower)
    };
  });

  ALL_ALLIANCES = [...new Set(ALL_PLAYERS.map(p => p.alliance))].sort();

  setupAllianceSearch(myAllianceInput, myAllianceResults, onMyAllianceSelected);
  setupAllianceSearch(oppAllianceInput, oppAllianceResults, onOppAllianceSelected);

  console.log("✅ Players loaded:", ALL_PLAYERS.length);
  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);
}

/* =============================
   SEARCHABLE ALLIANCE INPUT
============================= */
function setupAllianceSearch(input, resultBox, onSelect) {
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    resultBox.innerHTML = "";

    if (!q) {
      resultBox.style.display = "none";
      return;
    }

    const matches = ALL_ALLIANCES
      .filter(a => a.toLowerCase().includes(q))
      .slice(0, 20);

    if (!matches.length) {
      resultBox.innerHTML =
        `<div class="buster-search-item">No results</div>`;
      resultBox.style.display = "block";
      return;
    }

    matches.forEach(a => {
      const div = document.createElement("div");
      div.className = "buster-search-item";
      div.textContent = a;
      div.onclick = () => {
        input.value = a;
        resultBox.style.display = "none";
        onSelect(a);
      };
      resultBox.appendChild(div);
    });

    resultBox.style.display = "block";
  });

  document.addEventListener("click", e => {
    if (!resultBox.contains(e.target) && e.target !== input) {
      resultBox.style.display = "none";
    }
  });
}

/* =============================
   ALLIANCE SELECTION
============================= */
function onMyAllianceSelected(alliance) {
  myAlliancePlayers = ALL_PLAYERS.filter(p => p.alliance === alliance);

  myPlayerSelect.innerHTML =
    `<option value="">Select yourself</option>`;

  myAlliancePlayers.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${Math.round(p.fsp / 1e6)}M FSP)`;
    myPlayerSelect.appendChild(opt);
  });


}

function onOppAllianceSelected(alliance) {
  opponentPlayers = ALL_PLAYERS.filter(p => p.alliance === alliance);
  render();
}

/* =============================
   EVENTS
============================= */
myPlayerSelect.addEventListener("change", render);
manualToggle.addEventListener("change", render);
manualInput.addEventListener("input", render);
document
  .querySelector(".buster-summary-item.can")
  .addEventListener("click", () =>
    openMatchupModal("Can Beat", window._lastBuckets?.canBeat || [])
  );

document
  .querySelector(".buster-summary-item.maybe")
  .addEventListener("click", () =>
    openMatchupModal("May / May Not Beat", window._lastBuckets?.mayBeat || [])
  );

document
  .querySelector(".buster-summary-item.cannot")
  .addEventListener("click", () =>
    openMatchupModal("Cannot Beat", window._lastBuckets?.cannotBeat || [])
  );

/* =============================
   ADVANCED PANEL TOGGLE
============================= */
advancedToggle.onclick = () => {
  const open = advancedPanel.style.display === "block";
  advancedPanel.style.display = open ? "none" : "block";
  advancedToggle.textContent =
    (open ? "▶" : "▼") + " Advanced Matchups";
};

function openMatchupModal(title, list) {
  modalTitle.textContent = title;
  modalBody.innerHTML = renderAdvancedGroup(list, getCurrentFSP());
  matchupModal.classList.remove("hidden");
}

closeModalBtn.onclick = () => {
  matchupModal.classList.add("hidden");
};

document
  .querySelector(".buster-modal-backdrop")
  .onclick = closeModalBtn.onclick;




  function getCurrentFSP() {
  const player = myAlliancePlayers.find(
    p => p.id === myPlayerSelect.value
  );
  if (!player) return 0;

  if (manualToggle.checked) {
    const v = Number(manualInput.value);
    if (v > 0 && v <= player.fsp * MANUAL_FSP_CAP) return v;
  }
  return player.fsp;
}

/* =============================
   RENDER (FINAL)
============================= */
function render() {
  const player = myAlliancePlayers.find(
    p => p.id === myPlayerSelect.value
  );
  if (!player || !opponentPlayers.length) return;


  computedFspValue.textContent =
    `${Math.round(player.fsp / 1e6)}M`;

  /* ---- Effective FSP ---- */
  let myFSP = player.fsp;

  if (manualToggle.checked) {
    manualInput.disabled = false;
    const v = Number(manualInput.value);

    if (v > 0 && v <= player.fsp * MANUAL_FSP_CAP) {
      myFSP = v;
      fspSourceNote.textContent =
        "⚠ Manual FSP override (session only)";
    } else {
      fspSourceNote.textContent =
        "⚠ Invalid manual FSP (using computed)";
    }
  } else {
    manualInput.disabled = true;
    fspSourceNote.textContent = "";
  }

  /* ---- Opponents (Real + Synthetic) ---- */
  const synthetic = buildSyntheticCommanders({
    listedPlayers: opponentPlayers,
    referencePower: WARZONE_BASE_POWER
  });

  const allOpponents = [...opponentPlayers, ...synthetic];

  /* ---- Bucketing (LOCKED RULES) ---- */
  const canBeat = [];
  const mayBeat = [];
  const cannotBeat = [];

  allOpponents.forEach(p => {
    const diff = p.fsp - myFSP;

    if (diff <= 0) canBeat.push(p);
    else if (diff <= 5_000_000) mayBeat.push(p);
    else cannotBeat.push(p);
  });
window._lastBuckets = {
  canBeat,
  mayBeat,
  cannotBeat
};

  /* ---- Impact Summary (COUNTS ONLY) ---- */
  canHandleEl.textContent = canBeat.length;
  canStallEl.textContent = mayBeat.length;
  avoidEl.textContent = cannotBeat.length;

 /* ---- Advanced Lists (REAL + ASSUMED) ---- */
document.getElementById("canBeatList").innerHTML =
  renderAdvancedGroup(canBeat, myFSP);

document.getElementById("mayBeatList").innerHTML =
  renderAdvancedGroup(mayBeat, myFSP);

document.getElementById("cannotBeatList").innerHTML =
  renderAdvancedGroup(cannotBeat, myFSP);


  renderConfidence();
}

/* =============================
   ROW RENDER
============================= */
function renderRow(p, myFSP) {
  const diff = p.fsp - myFSP;
  const diffTxt =
    diff > 0 ? ` (+${Math.round(diff / 1e6)}M)` : "";

  return `
    <div class="buster-target">
      <div>
        <div class="buster-target-name">${p.name}</div>
        <div class="buster-target-meta">
          FSP ${Math.round(p.fsp / 1e6)}M${diffTxt}
        </div>
      </div>
    </div>
  `;
}

function renderAdvancedGroup(list, myFSP) {
  const real = list.filter(p => !p.isSynthetic);
  const syntheticCount = list.filter(p => p.isSynthetic).length;

  let html = real.map(p => renderRow(p, myFSP)).join("");

  if (syntheticCount > 0) {
    html += `
      <div class="buster-target buster-assumed">
        <div>
          <div class="buster-target-name">
            Assumed Commanders × ${syntheticCount}
          </div>
          <div class="buster-target-meta">
            Estimated from warzone base power
          </div>
        </div>
      </div>
    `;
  }

  return html || `<div class="buster-target badge-muted">None</div>`;
}






/* =============================
   CONFIDENCE
============================= */
function renderConfidence() {
  let score = 100;
  if (manualToggle.checked) score -= 20;

  if (score >= 80) {
    confidenceBadge.textContent = "HIGH";
    confidenceBadge.className = "buster-badge badge-green";
  } else if (score >= 60) {
    confidenceBadge.textContent = "MEDIUM";
    confidenceBadge.className = "buster-badge badge-yellow";
  } else {
    confidenceBadge.textContent = "LOW";
    confidenceBadge.className = "buster-badge badge-red";
  }
}
