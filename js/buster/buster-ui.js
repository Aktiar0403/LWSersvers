console.log("🧨 Buster UI loaded");

import { calculatePTI } from "./pti-engine.js";
import { buildSyntheticCommanders } from "./synthetic-engine.js";
import { loadAlliancePlayers } from "./buster-data.js";

// ---- CONFIG (session only) ----
const MANUAL_FSP_CAP = 1.25; // 125%
const STALL_BUFFER = 2;      // show 2 as stall
const WARZONE_BASE_POWER = window.WARZONE_BASE_POWER || 130e6;

// ---- STATE ----
let myAlliancePlayers = [];
let opponentPlayers = [];
let missingIds = new Set();

// ---- DOM ----
const select = document.getElementById("myPlayerSelect");
const card = document.getElementById("playerCard");
const computedFspEl = document.getElementById("computedFspValue");
const manualToggle = document.getElementById("manualFspToggle");
const manualInput = document.getElementById("manualFspInput");
const fspNote = document.getElementById("fspSourceNote");

const canHandleEl = document.getElementById("canHandleCount");
const canStallEl = document.getElementById("canStallCount");
const avoidEl = document.getElementById("avoidCount");

const targetList = document.getElementById("targetList");
const missingList = document.getElementById("missingPlayerList");
const confidenceBadge = document.getElementById("confidenceBadge");
const myAllianceSelect = document.getElementById("myAllianceSelect");
const oppAllianceSelect = document.getElementById("oppAllianceSelect");


// ---- INIT (expects globals set by your app/router) ----
// =============================
// ALLIANCE SELECTION FLOW
// =============================

// My alliance selected
myAllianceSelect.addEventListener("change", async () => {
  const alliance = myAllianceSelect.value;
  if (!alliance) return;

  // Reset dependent state
  myAlliancePlayers = [];
  select.innerHTML = `<option value="">Select a player</option>`;
  card.style.display = "none";

  // Load ONLY my alliance
  myAlliancePlayers = await loadAlliancePlayers(alliance);

  populateMyPlayers();
});

// Opponent alliance selected
oppAllianceSelect.addEventListener("change", async () => {
  const alliance = oppAllianceSelect.value;
  if (!alliance) return;

  // Reset missing selections
  missingIds.clear();

  // Load ONLY opponent alliance
  opponentPlayers = await loadAlliancePlayers(alliance);

  renderMissingList();
  render(); // re-run PTI if player already selected
});


// ---- UI WIRING ----
select.addEventListener("change", render);
manualToggle.addEventListener("change", render);
manualInput.addEventListener("input", render);
document.querySelectorAll("input[name=targetBand]")
  .forEach(r => r.addEventListener("change", render));




// ---- HELPERS ----
function populateMyPlayers() {
  select.innerHTML = `<option value="">Select a player</option>`;
  myAlliancePlayers.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${Math.round(p.fsp / 1e6)}M FSP)`;
    select.appendChild(opt);
  });
}

function getSelectedPlayer() {
  return myAlliancePlayers.find(p => p.id === select.value);
}

function getEffectiveFSP(player) {
  if (!manualToggle.checked) return player.fsp;
  const v = Number(manualInput.value || 0);
  if (v > 0 && v <= player.fsp * MANUAL_FSP_CAP) return v;
  return player.fsp;
}

// ---- BEWARE META ----
function getBewareMeta(myFSP, t) {
  const diff = t.fsp - myFSP;

  if (t.isSynthetic) return { label: "ASSUMED", cls: "badge-muted" };
  if (t.tier === "whale" || t.tier === "mega")
    return { label: "WHALE", cls: "badge-red" };

  if (diff <= 0) return { label: "SAFE", cls: "badge-green" };
  if (diff <= 1_000_000) return { label: "EVEN", cls: "badge-yellow" };
  if (diff <= 3_000_000) return { label: "RISK", cls: "badge-yellow" };
  return { label: "AVOID", cls: "badge-red" };
}

function renderTargetRow(t, myFSP) {
  const meta = getBewareMeta(myFSP, t);
  return `
    <div class="buster-target">
      <div>
        <div class="buster-target-name">${t.name}</div>
        <div class="buster-target-meta">
          FSP: ${Math.round(t.fsp / 1e6)}M
        </div>
      </div>
      <span class="buster-badge ${meta.cls}">${meta.label}</span>
    </div>
  `;
}

// ---- MISSING PLAYERS ----
function renderMissingList() {
  if (!opponentPlayers.length) {
    missingList.textContent = "No opponent loaded";
    return;
  }

  missingList.innerHTML = opponentPlayers.map(p => `
    <label style="display:block; font-size:13px;">
      <input type="checkbox" data-id="${p.id}"
        ${missingIds.has(p.id) ? "checked" : ""} />
      ${p.name} (${Math.round(p.fsp / 1e6)}M)
    </label>
  `).join("");

  missingList.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      cb.checked ? missingIds.add(id) : missingIds.delete(id);
      render();
    });
  });
}

// ---- CONFIDENCE ----
function getConfidence() {
  let score = 100;
  if (manualToggle.checked) score -= 20;
  score -= missingIds.size * 5;

  if (score >= 80) return { t: "HIGH", c: "badge-green" };
  if (score >= 60) return { t: "MEDIUM", c: "badge-yellow" };
  return { t: "LOW", c: "badge-red" };
}

// ---- RENDER ----
function render() {
  const player = getSelectedPlayer();
  if (!player) {
    card.style.display = "none";
    targetList.innerHTML = `<div class="buster-target badge-muted">
      Select a player to view targets
    </div>`;
    return;
  }

  card.style.display = "block";
  computedFspEl.textContent = `${Math.round(player.fsp / 1e6)}M`;

  // Manual FSP
  if (manualToggle.checked) {
    manualInput.disabled = false;
    fspNote.textContent = "⚠ Manual FSP override active (session-only)";
  } else {
    manualInput.disabled = true;
    fspNote.textContent = "";
  }

  const myFSP = getEffectiveFSP(player);

  // Build opponents (+ synthetic), then remove missing
  const synthetic = buildSyntheticCommanders({
    listedPlayers: opponentPlayers,
    referencePower: WARZONE_BASE_POWER
  });

  const allOpponents = [...opponentPlayers, ...synthetic]
    .filter(p => !missingIds.has(p.id));

  const band = document.querySelector("input[name=targetBand]:checked").value;

  const result = calculatePTI({
    myPlayer: { ...player, effectiveFSP: myFSP },
    opponents: allOpponents,
    band
  });

  // Summary
  canHandleEl.textContent = result.canHandle.length;
  canStallEl.textContent = result.canStall.length;
  avoidEl.textContent = result.avoid.length;

  // Confidence
  const conf = getConfidence();
  confidenceBadge.className = `buster-badge ${conf.c}`;
  confidenceBadge.textContent = conf.t;

  // Targets (group synthetic)
  const real = result.canHandle
    .concat(result.canStall, result.avoid)
    .filter(t => !t.isSynthetic);

  const syntheticGroup = allOpponents.filter(t => t.isSynthetic);

  let html = real.map(t => renderTargetRow(t, myFSP)).join("");

  if (syntheticGroup.length) {
    html += `
      <div class="buster-target">
        <div>
          <div class="buster-target-name">
            Unlisted Commanders (×${syntheticGroup.length})
          </div>
          <div class="buster-target-meta">
            Estimated FSP: ${Math.round(syntheticGroup[0].fsp / 1e6)}M
          </div>
        </div>
        <span class="buster-badge badge-muted">ASSUMED</span>
      </div>
    `;
  }

  if (!html) {
    html = `<div class="buster-target badge-muted">
      No eligible targets in this band
    </div>`;
  }

  targetList.innerHTML = html;
}
