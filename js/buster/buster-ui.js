console.log("🧨 Buster UI loaded");

/* =============================
   FIREBASE IMPORTS
============================= */
import { db } from "../firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { estimateFirstSquadPower } from "../acis/acis-engine.js";
import { calculatePTI } from "./pti-engine.js";
import { buildSyntheticCommanders } from "./synthetic-engine.js";

/* =============================
   DOM ELEMENTS
============================= */
const myAllianceInput = document.getElementById("myAllianceSearch");
const myAllianceResults = document.getElementById("myAllianceResults");

const oppAllianceInput = document.getElementById("oppAllianceSearch");
const oppAllianceResults = document.getElementById("oppAllianceResults");

const myPlayerSelect = document.getElementById("myPlayerSelect");

const playerCard = document.getElementById("playerCard");
const computedFspValue = document.getElementById("computedFspValue");

const manualToggle = document.getElementById("manualFspToggle");
const manualInput = document.getElementById("manualFspInput");
const fspSourceNote = document.getElementById("fspSourceNote");

const canHandleEl = document.getElementById("canHandleCount");
const canStallEl = document.getElementById("canStallCount");
const avoidEl = document.getElementById("avoidCount");

const targetList = document.getElementById("targetList");
const missingList = document.getElementById("missingPlayerList");
const confidenceBadge = document.getElementById("confidenceBadge");

/* =============================
   STATE
============================= */
let ALL_PLAYERS = [];
let ALL_ALLIANCES = [];

let myAlliancePlayers = [];
let opponentPlayers = [];

let missingIds = new Set();

/* =============================
   CONFIG
============================= */
const WARZONE_BASE_POWER = 130e6;
const MANUAL_FSP_CAP = 1.25;

/* =============================
   INIT – LOAD ALL DATA ONCE
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
      effectivePower,
      fsp: estimateFirstSquadPower(effectivePower),
      tier: inferTier(effectivePower)
    };
  });

  ALL_ALLIANCES = [...new Set(ALL_PLAYERS.map(p => p.alliance))].sort();

  setupAllianceSearch(
    myAllianceInput,
    myAllianceResults,
    onMyAllianceSelected
  );

  setupAllianceSearch(
    oppAllianceInput,
    oppAllianceResults,
    onOppAllianceSelected
  );

  console.log("✅ Loaded players:", ALL_PLAYERS.length);
  console.log("✅ Alliances:", ALL_ALLIANCES.length);
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

  playerCard.style.display = "none";
}

function onOppAllianceSelected(alliance) {
  opponentPlayers = ALL_PLAYERS.filter(p => p.alliance === alliance);
  missingIds.clear();
  renderMissingList();
  render();
}

/* =============================
   PLAYER SELECTION
============================= */
myPlayerSelect.addEventListener("change", render);
manualToggle.addEventListener("change", render);
manualInput.addEventListener("input", render);
document.querySelectorAll("input[name=targetBand]")
  .forEach(r => r.addEventListener("change", render));

/* =============================
   RENDER
============================= */
function render() {
  const player = myAlliancePlayers.find(p => p.id === myPlayerSelect.value);
  if (!player || !opponentPlayers.length) return;

  playerCard.style.display = "block";
  computedFspValue.textContent =
    `${Math.round(player.fsp / 1e6)}M`;

  let myFSP = player.fsp;
  if (manualToggle.checked) {
    manualInput.disabled = false;
    const v = Number(manualInput.value);
    if (v > 0 && v <= player.fsp * MANUAL_FSP_CAP) {
      myFSP = v;
      fspSourceNote.textContent =
        "⚠ Manual FSP override (session only)";
    }
  } else {
    manualInput.disabled = true;
    fspSourceNote.textContent = "";
  }

  const synthetic = buildSyntheticCommanders({
    listedPlayers: opponentPlayers,
    referencePower: WARZONE_BASE_POWER
  });

  const allOpponents = [...opponentPlayers, ...synthetic]
    .filter(p => !missingIds.has(p.id));

  const band =
    document.querySelector("input[name=targetBand]:checked").value;

  const result = calculatePTI({
    myPlayer: { ...player, effectiveFSP: myFSP },
    opponents: allOpponents,
    band
  });

  canHandleEl.textContent = result.canHandle.length;
  canStallEl.textContent = result.canStall.length;
  avoidEl.textContent = result.avoid.length;

  renderTargets(result, myFSP);
  renderConfidence();
}

/* =============================
   TARGETS
============================= */
function renderTargets(result, myFSP) {
  const real = [...result.canHandle, ...result.canStall, ...result.avoid]
    .filter(p => !p.isSynthetic);

  const synthetic = result.canHandle
    .concat(result.canStall, result.avoid)
    .filter(p => p.isSynthetic);

  let html = real.map(p => {
    const diff = p.fsp - myFSP;
    let cls = "badge-green", label = "SAFE";

    if (p.tier === "whale" || p.tier === "mega") {
      cls = "badge-red"; label = "WHALE";
    } else if (diff > 3e6) {
      cls = "badge-red"; label = "AVOID";
    } else if (diff > 1e6) {
      cls = "badge-yellow"; label = "RISK";
    }

    return `
      <div class="buster-target">
        <div>
          <div class="buster-target-name">${p.name}</div>
          <div class="buster-target-meta">
            FSP ${Math.round(p.fsp / 1e6)}M
          </div>
        </div>
        <span class="buster-badge ${cls}">${label}</span>
      </div>
    `;
  }).join("");

  if (synthetic.length) {
    html += `
      <div class="buster-target">
        <div>
          <div class="buster-target-name">
            Unlisted Commanders (×${synthetic.length})
          </div>
          <div class="buster-target-meta">
            Est FSP ${Math.round(synthetic[0].fsp / 1e6)}M
          </div>
        </div>
        <span class="buster-badge badge-muted">ASSUMED</span>
      </div>
    `;
  }

  targetList.innerHTML = html || `
    <div class="buster-target badge-muted">No targets</div>
  `;
}

/* =============================
   MISSING PLAYERS
============================= */
function renderMissingList() {
  missingList.innerHTML = opponentPlayers.map(p => `
    <label style="display:block;font-size:13px;">
      <input type="checkbox" data-id="${p.id}" />
      ${p.name}
    </label>
  `).join("");

  missingList.querySelectorAll("input").forEach(cb => {
    cb.onchange = () => {
      cb.checked ? missingIds.add(cb.dataset.id)
                 : missingIds.delete(cb.dataset.id);
      render();
    };
  });
}

/* =============================
   CONFIDENCE
============================= */
function renderConfidence() {
  let score = 100;
  if (manualToggle.checked) score -= 20;
  score -= missingIds.size * 5;

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

/* =============================
   UTILS
============================= */
function inferTier(power) {
  if (power >= 300e6) return "whale";
  if (power >= 200e6) return "mega";
  if (power >= 120e6) return "frontline";
  return "depth";
}
