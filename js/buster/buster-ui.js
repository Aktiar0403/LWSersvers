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


  UI_PHASE = "INTRO";
  resetUI();
}


/* =============================
   STATE
============================= */
let ALL_PLAYERS = [];
let ALL_ALLIANCES = [];

let myAlliancePlayers = [];
let opponentPlayers = [];
let OPPONENT_WARZONE = null;
let ACTIVE_FSP = 0;
let UI_PHASE = "INTRO";
// INTRO → SELECT → IDENTIFY → RESULT

/* =============================
   CONFIG
============================= */
const WARZONE_BASE_POWER = 130e6;
const MANUAL_FSP_CAP = 1.5;

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

      // Feedback to user (optional, simple)
      console.log(
        `Loaded ${ALL_PLAYERS.length} players across ${ALL_ALLIANCES.length} alliances`
      );

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

  const effectivePower = Number(
    x.basePower ?? x.totalPower ?? 0
  );

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
  OPPONENT_WARZONE = opponentPlayers[0]?.warzone ?? null;
  opponentPlayers = ALL_PLAYERS.filter(p => p.alliance === alliance);

  identifySection.classList.remove("hidden");
  UI_PHASE = "IDENTIFY";
}



/* =============================
   EVENTS
============================= */
myPlayerSelect.addEventListener("change", () => {
  showLoader("Evaluating frontline pressure…");






const player = myAlliancePlayers.find(
    p => p.id === myPlayerSelect.value
  );

  if (!player) return;

  // ✅ Phase 1 responsibility
  ACTIVE_FSP = player.fsp;

  // Keep existing display behavior
  computedFspValue.textContent =
    `${Math.round(player.fsp / 1e6)}M`




  setTimeout(() => {
  hideLoader();
  resultSection.classList.remove("hidden");
  UI_PHASE = "RESULT";
  render();
  }, 1000);

  });

  //manualToggle.addEventListener("change", render);
  //manualInput.addEventListener("input", render);
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
  return ACTIVE_FSP || 0;
}



function computeWarzoneThreats(opponentAlliancePlayers) {

 console.log("🧪 THREAT INPUT SIZE:", opponentAlliancePlayers.length);
  console.log(
    "🧪 INPUT ALLIANCES:",
    [...new Set(opponentAlliancePlayers.map(p => p.alliance))]
  );

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
  console.log("🧪 RESOLVED WARZONE:", warzone);

  if (!Number.isFinite(warzone)) {
    console.warn("⚠️ Invalid warzone value:", warzone);
    return { top, baseFsp: 0 };
  }

  const warzonePlayers = ALL_PLAYERS
    .filter(p => p.warzone === warzone && p.fsp > 0);
      console.log("🧪 WARZONE PLAYER COUNT:", warzonePlayers.length);
  console.log(
    "🧪 WARZONE TOP 3 ALLIANCES:",
    warzonePlayers
      .sort((a, b) => b.fsp - a.fsp)
      .slice(0, 3)
      .map(p => `${p.name} (${p.alliance})`)
  );

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
  console.log("PHASE 1 | ACTIVE_FSP USED:", getCurrentFSP());

  if (UI_PHASE !== "RESULT") return;
  if (!opponentPlayers.length) return;   // 🔑 only opponent required

  // 🔹 Declare player ONCE, before any use
  const player = myAlliancePlayers.find(
    p => p.id === myPlayerSelect.value
  );

 // =============================
// WARZONE THREATS — STABLE
// =============================

// Guard: warzone must be known
if (!OPPONENT_WARZONE) return;

// Pull WARZONE-WIDE players (not alliance)
const warzonePlayers = ALL_PLAYERS.filter(
  p => p.warzone === OPPONENT_WARZONE && p.fsp > 0
);

// Compute threats ONLY from warzone data
const { top, baseFsp } = computeWarzoneThreats(warzonePlayers);

// --- TOP 1 ---
if (top[0]) {
  threatTop1NameEl.textContent = top[0].name;
  threatTop1AllianceEl.textContent = top[0].alliance;
  threatTop1FspEl.textContent =
    `FSP ${Math.round(top[0].fsp / 1e6)}M`;
}

// --- TOP 2 ---
if (top[1]) {
  threatTop2NameEl.textContent = top[1].name;
  threatTop2AllianceEl.textContent = top[1].alliance;
  threatTop2FspEl.textContent =
    `FSP ${Math.round(top[1].fsp / 1e6)}M`;
}

// --- TOP 3 ---
if (top[2]) {
  threatTop3NameEl.textContent = top[2].name;
  threatTop3AllianceEl.textContent = top[2].alliance;
  threatTop3FspEl.textContent =
    `FSP ${Math.round(top[2].fsp / 1e6)}M`;
}

// --- WARZONE BASE (200th) ---
if (threatBaseEl) {
  threatBaseEl.textContent =
    `${Math.round(baseFsp / 1e6)}M`;
}

// --- DEBUG (now truthful) ---
console.log("🧪 WARZONE THREAT CHECK", {
  warzone: OPPONENT_WARZONE,
  top3: top.map(p => `${p.name} (${p.alliance})`),
  baseFsp
});


  /* =============================
     STOP HERE IF player NOT CHOSEN
  ============================== */
  if (!player) return;

  /* =============================
     PLAYER-DEPENDENT LOGIC BELOW
  ============================== */

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
    } else {
      fspSourceNote.textContent =
        "⚠ Invalid manual FSP (using computed)";
    }
  } else {
    manualInput.disabled = true;
    fspSourceNote.textContent = "";
  }

  const synthetic = buildSyntheticCommanders({
    listedPlayers: opponentPlayers,
    referencePower: WARZONE_BASE_POWER
  });

  const allOpponents = [...opponentPlayers, ...synthetic];

  // (bucketing logic continues unchanged)



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
