console.log("🧨 buster-ui.js ");

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
const computedFspValue = document.getElementById("computedFspValue");
const canHandleEl = document.getElementById("canHandleCount");
const canStallEl = document.getElementById("canStallCount");
const avoidEl = document.getElementById("avoidCount");
const matchupModal = document.getElementById("matchupModal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const closeModalBtn = document.getElementById("closeModal");
const threatTop1NameEl = document.getElementById("threatTop1Name");
const threatTop1AllianceEl = document.getElementById("threatTop1Alliance");
const threatTop1FspEl = document.getElementById("threatTop1Fsp");
const threatTop2NameEl = document.getElementById("threatTop2Name");
const threatTop2AllianceEl = document.getElementById("threatTop2Alliance");
const threatTop2FspEl = document.getElementById("threatTop2Fsp");
const threatTop3NameEl = document.getElementById("threatTop3Name");
const threatTop3AllianceEl = document.getElementById("threatTop3Alliance");
const threatTop3FspEl = document.getElementById("threatTop3Fsp");
const threatBaseEl = document.getElementById("threatBase");
const confidenceBadge = document.getElementById("confidenceBadge");

/* =============================
   MANUAL MODE ELEMENTS (NEW)
============================= */
const manualFspPrimaryInput = document.getElementById("manualFspPrimaryInput");
const fspSlider = document.getElementById("fspSlider");
const sliderValueDisplay = document.getElementById("sliderValueDisplay");
const fallbackSection = document.getElementById("fallbackSection");
const myPlayerSelect = document.getElementById("myPlayerSelect");
const fspSourceNote = document.getElementById("fspSourceNote");
const manualModeInfoModal = document.getElementById("manualModeInfoModal");
const closeManualModal = document.getElementById("closeManualModal");
const closeManualModalBtn = document.getElementById("closeManualModalBtn");

/* =============================
   UI PHASE ELEMENTS
============================= */
const introSection = document.getElementById("busterIntro");
const selectSection = document.getElementById("busterSelect");
const identifySection = document.getElementById("busterIdentify");
const resultSection = document.getElementById("busterResult");
const startBusterBtn = document.getElementById("startBusterBtn");
const loaderEl = document.getElementById("busterLoader");

/* =============================
   INITIAL UI STATE (HARD RESET)
============================= */
function resetUI() {
  introSection.classList.remove("hidden");
  selectSection.classList.add("hidden");
  identifySection.classList.add("hidden");
  resultSection.classList.add("hidden");
  setClockCompact(false);

  // Reset manual mode
  MANUAL_MODE = {
    active: true,
    baseValue: 0,
    sliderOffset: 50,
    lastValidInput: 0,
    usingFallback: false
  };
  
  // Reset inputs if they exist
  if (manualFspPrimaryInput) {
    manualFspPrimaryInput.value = "";
  }
  if (fspSlider) {
    fspSlider.value = 50;
  }
  if (sliderValueDisplay) {
    sliderValueDisplay.textContent = "±0.0M";
  }
  if (fallbackSection) {
    fallbackSection.classList.add("hidden");
  }
  if (myPlayerSelect) {
    myPlayerSelect.value = "";
  }
  
  UI_PHASE = "INTRO";
}

/* =============================
   STATE
============================= */
let ALL_PLAYERS = [];
let ALL_ALLIANCES = [];
let myAlliancePlayers = [];
let opponentPlayers = [];
let UI_PHASE = "INTRO";

/* =============================
   MANUAL MODE STATE
============================= */
let MANUAL_MODE = {
  active: true,
  baseValue: 0,
  sliderOffset: 50,
  lastValidInput: 0,
  usingFallback: false
};

/* =============================
   CONFIG
============================= */
const WARZONE_BASE_POWER = 130e6;
const MANUAL_FSP_CAP = 1.25;

/* =============================
   LOADER HELPERS
============================= */
function showLoader(text) {
  if (!loaderEl) return;
  loaderEl.classList.remove("hidden");
  if (text) {
    const t = loaderEl.querySelector(".loader-text");
    if (t) t.textContent = text;
  }
}

function hideLoader() {
  if (!loaderEl) return;
  loaderEl.classList.add("hidden");
}

function setClockCompact(isCompact) {
  const clock = document.getElementById("busterCountdown");
  if (!clock) return;
  clock.classList.toggle("compact", isCompact);
}

/* =============================
   BUSTER START FLOW
============================= */
if (startBusterBtn) {
  startBusterBtn.addEventListener("click", async () => {
    // Hide intro
    introSection.classList.add("hidden");
    setClockCompact(true);

    // Fake 1s anticipation loader
    showLoader("Initializing Buster Intelligence…");

    setTimeout(async () => {
      showLoader("Loading battlefield data…");
      // REAL DATA LOAD
      await init();
      hideLoader();
      // Reveal alliance selection
      selectSection.classList.remove("hidden");
      UI_PHASE = "SELECT";
      console.log(`Loaded ${ALL_PLAYERS.length} players across ${ALL_ALLIANCES.length} alliances`);
    }, 1000);
  });
}
/* =============================
   INIT
============================= */
async function init() {
  const snap = await getDocs(collection(db, "server_players"));

  ALL_PLAYERS = snap.docs.map(d => {
    const x = d.data();
    const effectivePower = Number(x.basePower ?? x.totalPower ?? 0);

    return {
      id: d.id,
      name: x.name || "Unknown",
      alliance: x.alliance || "",
      warzone: Number(x.warzone),
      rawPower: Number(x.totalPower ?? x.basePower ?? 0),
      fsp: estimateFirstSquadPower(effectivePower)
    };
  });

  ALL_ALLIANCES = [...new Set(ALL_PLAYERS.map(p => p.alliance))].sort();

  setupAllianceSearch(myAllianceInput, myAllianceResults, onMyAllianceSelected);
  setupAllianceSearch(oppAllianceInput, oppAllianceResults, onOppAllianceSelected);
  
  // Initialize manual mode with null checks
  initManualMode();

  console.log("✅ Players loaded:", ALL_PLAYERS.length);
  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);
  console.log("✅ Manual mode initialized");
}

/* =============================
   MANUAL MODE INITIALIZATION (WITH NULL CHECKS)
============================= */
function initManualMode() {
  console.log("🔧 Initializing manual mode elements...");
  
  // Check if manual mode elements exist
  if (!fspSlider) {
    console.error("❌ fspSlider element not found!");
    return;
  }
  
  if (!manualFspPrimaryInput) {
    console.error("❌ manualFspPrimaryInput element not found!");
    return;
  }
  
  if (!myPlayerSelect) {
    console.error("❌ myPlayerSelect element not found!");
    return;
  }
  
  // Setup slider
  fspSlider.addEventListener("input", handleSliderInput);
  
  // Setup manual input
  manualFspPrimaryInput.addEventListener("input", handleManualInput);
  manualFspPrimaryInput.addEventListener("blur", validateManualInput);
  
  // Setup player select fallback
  myPlayerSelect.addEventListener("change", handlePlayerSelectChange);
  
  // Setup modal close handlers if modals exist
  if (closeManualModal) {
    closeManualModal.onclick = closeManualInfoModal;
  }
  if (closeManualModalBtn) {
    closeManualModalBtn.onclick = closeManualInfoModal;
  }
  if (manualModeInfoModal) {
    const backdrop = manualModeInfoModal.querySelector(".buster-modal-backdrop");
    if (backdrop) {
      backdrop.onclick = closeManualInfoModal;
    }
  }
  
  // Initial state
  updateSliderDisplay(50);
  console.log("✅ Manual mode initialized successfully");
}

/* =============================
   MANUAL INPUT HANDLERS
============================= */
function handleManualInput(e) {
  const rawValue = e.target.value.replace(/,/g, '');
  const numericValue = parseFloat(rawValue);
  
  if (!isNaN(numericValue) && numericValue >= 0) {
    MANUAL_MODE.baseValue = numericValue;
    MANUAL_MODE.lastValidInput = numericValue;
    MANUAL_MODE.active = true;
    MANUAL_MODE.usingFallback = false;
    
    // Hide fallback section if manual input has value
    if (numericValue > 0 && fallbackSection) {
      fallbackSection.classList.add("hidden");
    }
    
    // If we already have opponent selected, show results
    if (UI_PHASE === "IDENTIFY" && opponentPlayers.length > 0) {
      showLoader("Evaluating frontline pressure…");
      setTimeout(() => {
        hideLoader();
        if (resultSection) {
          resultSection.classList.remove("hidden");
        }
        UI_PHASE = "RESULT";
        render();
      }, 1000);
    }
    // Trigger render if we're in result phase
    else if (UI_PHASE === "RESULT") {
      render();
    }
  }
}

function validateManualInput() {
  const value = parseFloat(manualFspPrimaryInput.value.replace(/,/g, ''));
  
  if (isNaN(value) || value <= 0) {
    // No valid manual input, show fallback
    MANUAL_MODE.active = false;
    MANUAL_MODE.usingFallback = true;
    
    if (fallbackSection) {
      fallbackSection.classList.remove("hidden");
    }
    
    // Show info modal on first empty input
    if (MANUAL_MODE.lastValidInput === 0 && manualModeInfoModal) {
      setTimeout(() => {
        manualModeInfoModal.classList.remove("hidden");
      }, 500);
    }
  }
}

/* =============================
   SLIDER HANDLERS
============================= */
function handleSliderInput(e) {
  const sliderValue = parseFloat(e.target.value);
  MANUAL_MODE.sliderOffset = sliderValue;
  
  updateSliderDisplay(sliderValue);
  
  // If we have a base value, trigger render
  if (MANUAL_MODE.baseValue > 0 && UI_PHASE === "RESULT") {
    render();
  }
}

function updateSliderDisplay(value) {
  if (!sliderValueDisplay) return;
  
  const offsetInMillions = (value - 50) / 2; // Convert 0-100 to -50 to +50
  let displayText = `${Math.abs(offsetInMillions).toFixed(1)}M`;
  
  if (offsetInMillions > 0) {
    displayText = `+${displayText}`;
  } else if (offsetInMillions < 0) {
    displayText = `-${displayText}`;
  } else {
    displayText = "±0.0M";
  }
  
  sliderValueDisplay.textContent = displayText;
}

/* =============================
   FALLBACK HANDLERS
============================= */
function handlePlayerSelectChange() {
  const selectedPlayerId = myPlayerSelect.value;
  if (!selectedPlayerId) return;
  
  const player = myAlliancePlayers.find(p => p.id === selectedPlayerId);
  if (player) {
    // Switch to fallback mode
    MANUAL_MODE.active = false;
    MANUAL_MODE.usingFallback = true;
    MANUAL_MODE.baseValue = player.fsp;
    
    // Update computed FSP display
    if (computedFspValue) {
      computedFspValue.textContent = `${Math.round(player.fsp / 1e6)}M`;
    }
    
    // Update manual input for reference
    manualFspPrimaryInput.value = formatFspValue(player.fsp);
    
    // Reset slider to midpoint
    fspSlider.value = 50;
    updateSliderDisplay(50);
    
    // Trigger render if in result phase
    if (UI_PHASE === "RESULT") {
      render();
    }
  }
}

/* =============================
   MODAL FUNCTIONS
============================= */
function closeManualInfoModal() {
  if (manualModeInfoModal) {
    manualModeInfoModal.classList.add("hidden");
  }
}

/* =============================
   GET CURRENT FSP (REVISED)
============================= */
function getCurrentFSP() {
  // Primary: Manual mode
  if (MANUAL_MODE.active && MANUAL_MODE.baseValue > 0) {
    const baseValue = MANUAL_MODE.baseValue;
    const sliderOffset = MANUAL_MODE.sliderOffset;
    
    // Calculate slider effect (±50M range)
    const offsetInMillions = (sliderOffset - 50) / 2; // -50 to +50
    const offsetValue = offsetInMillions * 1e6;
    
    let finalValue = baseValue + offsetValue;
    
    // Apply cap (1.25x of base if using slider)
    const capValue = baseValue * MANUAL_FSP_CAP;
    if (sliderOffset !== 50 && finalValue > capValue) {
      finalValue = capValue;
    }
    
    // Ensure non-negative
    return Math.max(0, finalValue);
  }
  
  // Fallback: Player selection
  if (MANUAL_MODE.usingFallback) {
    const selectedPlayerId = myPlayerSelect.value;
    if (selectedPlayerId) {
      const player = myAlliancePlayers.find(p => p.id === selectedPlayerId);
      if (player) {
        return player.fsp;
      }
    }
  }
  
  // Default fallback: First player in alliance or 0
  if (myAlliancePlayers.length > 0) {
    return myAlliancePlayers[0].fsp;
  }
  
  return 0;
}

/* =============================
   HELPER FUNCTIONS
============================= */
function formatFspValue(value) {
  if (!value || value <= 0) return "";
  return Math.round(value).toLocaleString();
}

/* =============================
   SEARCHABLE ALLIANCE INPUT
============================= */
function setupAllianceSearch(input, resultBox, onSelect) {
  if (!input || !resultBox) return;
  
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
      resultBox.innerHTML = `<div class="buster-search-item">No results</div>`;
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
  
  // Clear and populate fallback select
  if (myPlayerSelect) {
    myPlayerSelect.innerHTML = `<option value="">Select yourself from alliance</option>`;
    
    myAlliancePlayers.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${Math.round(p.fsp / 1e6)}M FSP)`;
      myPlayerSelect.appendChild(opt);
    });
  }
  
  // If manual input is empty, show fallback section
  if (MANUAL_MODE.baseValue <= 0 && fallbackSection) {
    fallbackSection.classList.remove("hidden");
    MANUAL_MODE.usingFallback = true;
  }
}

function onOppAllianceSelected(alliance) {
  opponentPlayers = ALL_PLAYERS.filter(p => p.alliance === alliance);

  if (identifySection) {
    identifySection.classList.remove("hidden");
  }
  UI_PHASE = "IDENTIFY";
  
  // If manual input already has value, auto-proceed to results
  if (MANUAL_MODE.baseValue > 0) {
    showLoader("Evaluating matchup…");
    setTimeout(() => {
      hideLoader();
      if (resultSection) {
        resultSection.classList.remove("hidden");
      }
      UI_PHASE = "RESULT";
      render();
    }, 1000);
  }
}

/* =============================
   EVENTS
============================= */
if (myPlayerSelect) {
  myPlayerSelect.addEventListener("change", () => {
    showLoader("Evaluating frontline pressure…");
    setTimeout(() => {
      hideLoader();
      if (resultSection) {
        resultSection.classList.remove("hidden");
      }
      UI_PHASE = "RESULT";
      render();
    }, 1000);
  });
}

// Matchup modal events
const canBeatEl = document.querySelector(".buster-summary-item.can");
const maybeEl = document.querySelector(".buster-summary-item.maybe");
const cannotEl = document.querySelector(".buster-summary-item.cannot");

if (canBeatEl) {
  canBeatEl.addEventListener("click", () =>
    openMatchupModal("Can Beat", window._lastBuckets?.canBeat || [])
  );
}
if (maybeEl) {
  maybeEl.addEventListener("click", () =>
    openMatchupModal("May / May Not Beat", window._lastBuckets?.mayBeat || [])
  );
}
if (cannotEl) {
  cannotEl.addEventListener("click", () =>
    openMatchupModal("Cannot Beat", window._lastBuckets?.cannotBeat || [])
  );
}

function openMatchupModal(title, list) {
  if (!matchupModal || !modalTitle || !modalBody) return;
  
  modalTitle.textContent = title;
  modalBody.innerHTML = renderAdvancedGroup(list, getCurrentFSP());
  matchupModal.classList.remove("hidden");
}

if (closeModalBtn) {
  closeModalBtn.onclick = () => {
    if (matchupModal) matchupModal.classList.add("hidden");
  };
}

const modalBackdrop = document.querySelector(".buster-modal-backdrop");
if (modalBackdrop) {
  modalBackdrop.onclick = () => {
    if (matchupModal) matchupModal.classList.add("hidden");
  };
}

/* =============================
   COMPUTE WARZONE THREATS
============================= */
function computeWarzoneThreats(opponentAlliancePlayers) {
  if (!opponentAlliancePlayers.length) {
    return { top: [], baseFsp: 0 };
  }

  /* -----------------------------
     TOP 3 THREATS (by FSP)
  ------------------------------ */
  const sortedAlliance = [...opponentAlliancePlayers]
    .filter(p => p.fsp > 0)
    .sort((a, b) => b.fsp - a.fsp);

  const top = sortedAlliance.slice(0, 3).map(p => ({
    name: p.name,
    alliance: p.alliance,
    fsp: p.fsp
  }));

  /* -----------------------------
     BASE FSP (WARZONE 200th)
  ------------------------------ */
  const warzone = opponentAlliancePlayers.find(
    p => Number.isFinite(p.warzone)
  )?.warzone;

  if (!Number.isFinite(warzone)) {
    console.warn("⚠️ Invalid warzone value:", warzone);
    return { top, baseFsp: 0 };
  }

  const warzonePlayers = ALL_PLAYERS
    .filter(p => p.warzone === warzone && p.fsp > 0);

  if (!warzonePlayers.length) {
    console.warn("⚠️ No players found for warzone", warzone);
    return { top, baseFsp: 0 };
  }

  warzonePlayers.sort((a, b) => b.fsp - a.fsp);

  const baseIndex = warzonePlayers.length >= 200
    ? 199
    : warzonePlayers.length - 1;

  const baseFsp = warzonePlayers[baseIndex].fsp;

  return { top, baseFsp };
}

/* =============================
   RENDER (FINAL)
============================= */
function render() {
  if (UI_PHASE !== "RESULT") return;
  
  // Get current FSP based on manual mode
  const myFSP = getCurrentFSP();
  
  // Update FSP source note
  if (fspSourceNote) {
    if (MANUAL_MODE.active && MANUAL_MODE.baseValue > 0) {
      if (MANUAL_MODE.sliderOffset !== 50) {
        const offset = ((MANUAL_MODE.sliderOffset - 50) / 2).toFixed(1);
        fspSourceNote.textContent = `Manual FSP with ${offset}M adjustment`;
      } else {
        fspSourceNote.textContent = "Manual FSP input";
      }
    } else if (MANUAL_MODE.usingFallback) {
      const selectedPlayer = myAlliancePlayers.find(p => p.id === myPlayerSelect.value);
      if (selectedPlayer) {
        fspSourceNote.textContent = `Using ${selectedPlayer.name}'s computed FSP`;
      }
    } else {
      fspSourceNote.textContent = "Using default FSP calculation";
    }
  }
  
  /* ---- Opponents (Real + Synthetic) ---- */
  const synthetic = buildSyntheticCommanders({
    listedPlayers: opponentPlayers,
    referencePower: WARZONE_BASE_POWER
  });

  const allOpponents = [...opponentPlayers, ...synthetic];

  /* ---- Warzone Threats ---- */
  const { top, baseFsp } = computeWarzoneThreats(opponentPlayers);

  if (top[0]) {
    threatTop1NameEl && (threatTop1NameEl.textContent = top[0].name);
    threatTop1AllianceEl && (threatTop1AllianceEl.textContent = top[0].alliance);
    threatTop1FspEl && (threatTop1FspEl.textContent =
      `FSP ${Math.round(top[0].fsp / 1e6)}M`);
  }

  if (top[1]) {
    threatTop2NameEl && (threatTop2NameEl.textContent = top[1].name);
    threatTop2AllianceEl && (threatTop2AllianceEl.textContent = top[1].alliance);
    threatTop2FspEl && (threatTop2FspEl.textContent =
      `FSP ${Math.round(top[1].fsp / 1e6)}M`);
  }

  if (top[2]) {
    threatTop3NameEl && (threatTop3NameEl.textContent = top[2].name);
    threatTop3AllianceEl && (threatTop3AllianceEl.textContent = top[2].alliance);
    threatTop3FspEl && (threatTop3FspEl.textContent =
      `FSP ${Math.round(top[2].fsp / 1e6)}M`);
  }

  /* ---- Warzone Base ---- */
  if (threatBaseEl) {
    threatBaseEl.textContent =
      `${Math.round(baseFsp / 1e6)}M`;
  }

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
  if (MANUAL_MODE.active && MANUAL_MODE.baseValue > 0) score = 95;
  if (MANUAL_MODE.usingFallback) score = 85;
  if (MANUAL_MODE.sliderOffset !== 50) score -= 10;

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
   BUSTER WEEKLY COUNTDOWN (IST)
============================= */
(function initBusterCountdown() {
  const titleEl = document.getElementById("countdownTitle");
  const timerEl = document.getElementById("countdownTimer");
  const countdownBox = document.getElementById("busterCountdown");
  const ctaBtn = document.getElementById("startBusterBtn");

  if (!titleEl || !timerEl || !countdownBox) return;

  // IST offset in minutes
  const IST_OFFSET = 330;

  function nowIST() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + IST_OFFSET * 60000);
  }

  function getNextSaturday730(istNow) {
    const d = new Date(istNow);
    const day = d.getDay(); // 0=Sun ... 6=Sat

    const daysUntilSaturday =
      day <= 6 ? (6 - day) : 0;

    d.setDate(d.getDate() + daysUntilSaturday);
    d.setHours(7, 30, 0, 0);

    // If it's already past Saturday 7:30, move to next week
    if (istNow >= d) {
      d.setDate(d.getDate() + 7);
    }

    return d;
  }

  function isBusterLive(istNow) {
    const start = new Date(istNow);
    const day = start.getDay();

    // Saturday
    if (day === 6) {
      const startTime = new Date(start);
      startTime.setHours(7, 30, 0, 0);
      return istNow >= startTime;
    }

    // Sunday
    if (day === 0) {
      const endTime = new Date(start);
      endTime.setHours(7, 30, 0, 0);
      return istNow < endTime;
    }

    return false;
  }

  function format(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    return `${d}d ${h}h ${m}m ${sec}s`;
  }

  function tick() {
    const istNow = nowIST();

    if (isBusterLive(istNow)) {
      // BUSTER LIVE
      titleEl.textContent = "🔥 Buster Day Live";
      countdownBox.classList.add("buster-live");
      ctaBtn && ctaBtn.classList.add("buster-live");

      // End is Sunday 7:30 AM IST
      const end = new Date(istNow);
      end.setDate(end.getDate() + (end.getDay() === 6 ? 1 : 0));
      end.setHours(7, 30, 0, 0);

      const remaining = end - istNow;
      timerEl.textContent = remaining > 0
        ? `Ends in ${format(remaining)}`
        : "Ending…";

    } else {
      // COUNTDOWN MODE
      titleEl.textContent = "Next Buster Day";
      countdownBox.classList.remove("buster-live");
      ctaBtn && ctaBtn.classList.remove("buster-live");

      const next = getNextSaturday730(istNow);
      timerEl.textContent = format(next - istNow);
    }
  }

  tick();
  setInterval(tick, 1000);
})();