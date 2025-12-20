/* ======================================================
   KOBRA — ALLIANCE SHOWDOWN (CLEAN FINAL)
====================================================== */

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { prepareAllianceData } from "./acis/acis-data.js";
import { processAlliance } from "./acis/acis-engine.js";
import { scoreAlliance } from "./acis/acis-scorer.js";
import { buildMatchupMatrix } from "./acis/acis-matchup.js";

/* =============================
   GLOBAL STATE
============================= */
let ALL_ALLIANCES = [];
let SELECTED = new Map();

/* =============================
   DOM
============================= */
const warzoneSelect   = document.getElementById("warzoneSelect");
const allianceListEl = document.getElementById("allianceList");
const analyzeBtn     = document.getElementById("analyzeBtn");
const resultsEl      = document.getElementById("results");

// Chart.js plugin to draw values above bars
const BarValuePlugin = {
  id: "barValuePlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();

    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((bar, index) => {
        const value = dataset.rawValues?.[index];
        if (value == null) return;

        ctx.fillStyle = "#eafff8"; // neon white
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        ctx.fillText(
          value,
          bar.x,
          bar.y - 6
        );
      });
    });

    ctx.restore();
  }
};

/* =============================
   LOAD DATA
============================= */
async function loadServerPlayers() {
  const snap = await getDocs(collection(db, "server_players"));

  return snap.docs.map(doc => {
    const d = doc.data();

    // 🔁 Backward compatibility for old records
    const base = Number(d.basePower ?? d.totalPower ?? 0);

    return {
      ...d,
      basePower: base,
      powerSource: d.powerSource || "confirmed",
      lastConfirmedAt: d.lastConfirmedAt || d.importedAt,
      effectivePower: base
    };
  });
}


/* =============================
   INIT
============================= */
async function init() {
  console.log("🔍 Loading server players…");

  const players = await loadServerPlayers();
  if (!players.length) return;

  const prepared = prepareAllianceData(players);
  ALL_ALLIANCES = prepared.map(a => {
    const scored = scoreAlliance(processAlliance(a));
    scored.totalAlliancePower = computeTotalAlliancePower(scored);
    return scored;
  });

  console.log("✅ Alliances loaded:", ALL_ALLIANCES.length);
  populateWarzones();
}
init();

/* =============================
   WARZONE SELECTOR
============================= */
function populateWarzones() {
  warzoneSelect.innerHTML =
    `<option value="">Select Warzone</option>`;

  [...new Set(ALL_ALLIANCES.map(a => Number(a.warzone)))]
    .filter(Boolean)
    .sort((a, b) => a - b)
    .forEach(wz => {
      const opt = document.createElement("option");
      opt.value = wz;
      opt.textContent = `Warzone ${wz}`;
      warzoneSelect.appendChild(opt);
    });
}

/* =============================
   WARZONE → ALLIANCES
============================= */
warzoneSelect.addEventListener("change", () => {
  allianceListEl.innerHTML = "";
  const wz = Number(warzoneSelect.value);
  if (!wz) return;

  ALL_ALLIANCES
    .filter(a => Number(a.warzone) === wz)
    .sort((a, b) => b.acsAbsolute - a.acsAbsolute)
    .slice(0, 20)
    .forEach(a => {
      const row = document.createElement("div");
      row.className = "alliance-row";
      row.textContent = a.alliance;

      const key = `${a.alliance}|${a.warzone}`;
      if (SELECTED.has(key)) row.classList.add("selected");

      row.onclick = () => toggleAlliance(a, row);
      allianceListEl.appendChild(row);
    });
});

/* =============================
   TOGGLE SELECTION
============================= */
function toggleAlliance(a, el) {
  const key = `${a.alliance}|${a.warzone}`;

  if (SELECTED.has(key)) {
    SELECTED.delete(key);
    el.classList.remove("selected");
  } else {
    if (SELECTED.size >= 8) return;
    SELECTED.set(key, a);
    el.classList.add("selected");
  }

  analyzeBtn.disabled = SELECTED.size < 2;
}




function renderMatchupCards(alliances) {
  const el = document.getElementById("matchups");
  if (!el) {
    console.error("❌ #matchups container not found");
    return;
  }

  el.innerHTML = "<h2>Showdown Results</h2>";

  const matchups = buildMatchupMatrix(alliances);
  if (!matchups.length) {
    el.innerHTML += "<p>No valid matchups generated.</p>";
    return;
  }

  matchups.forEach(m => {
    const A = alliances.find(x => x.alliance === m.a);
    const B = alliances.find(x => x.alliance === m.b);
    if (!A || !B) return;

    const winner = m.ratio >= 1 ? A : B;
    const loser  = winner === A ? B : A;

    const card = document.createElement("div");
    card.className = "matchup-card";

    card.innerHTML = `
      <div class="matchup-verdict">
        🏆 ${winner.alliance}
        <span class="vs">vs</span>
        💥 ${loser.alliance}
      </div>

      <div class="matchup-metric">
        Combat Ratio: <strong>${m.ratio.toFixed(2)}×</strong>
      </div>

      <div class="matchup-outcome">
        ${m.outcome}
      </div>
    `;

    el.appendChild(card);
  });
}
function ratioToProbability(ratio) {
  return 1 / (1 + Math.exp(-4 * (ratio - 1)));
}
function computeWinProbabilities(alliances) {
  const results = {};
  alliances.forEach(a => results[a.alliance] = []);

  const matchups = buildMatchupMatrix(alliances);

  matchups.forEach(m => {
    const pA = ratioToProbability(m.ratio);
    const pB = 1 - pA;

    results[m.a].push(pA);
    results[m.b].push(pB);
  });

  alliances.forEach(a => {
    const arr = results[a.alliance];
    a.winProbability = arr.length
      ? arr.reduce((s, v) => s + v, 0) / arr.length
      : 0;
  });
}


/* =============================
   ANALYZE
============================= */
analyzeBtn.addEventListener("click", () => {
  const alliances = [...SELECTED.values()];
  if (alliances.length < 2) return;

  // 🔥 COMPUTE COMBAT SCORE
  alliances.forEach(a => {
    a.combatScore = computeCombatScore(a);
  });

  // 🔥 SORT BY STRONGEST FIRST
  alliances.sort((a, b) => b.combatScore - a.combatScore);
    computeWinProbabilities(alliances);   // 🔥 REQUIRED HERE
  resultsEl.classList.remove("hidden");
  renderAllianceCards(alliances);
  renderMatchupCards(alliances);

});

/* =============================
   ALLIANCE CARDS
============================= */
function renderAllianceCards(alliances) {
  const el = document.getElementById("allianceCards");
  el.innerHTML = "";

alliances.forEach((a, index) => {

    const marquee = [...a.activePlayers]
      .filter(p => !p.assumed)
      .sort((x, y) => y.firstSquadPower - x.firstSquadPower)
      .slice(0, 5);

    const card = document.createElement("div");
    card.className = "alliance-card";

    card.innerHTML = `
  <div class="alliance-intel ${a.isNCA ? "bad" : a.stabilityFactor < 0.8 ? "warn" : "good"}">
  <div class="alliance-rank rank-${index + 1}">
  #${index + 1}
</div>


    <!-- HEADER STRIP -->
    <div class="intel-strip">
      <div class="intel-title">
        ${a.alliance} <span class="wz">(WZ-${a.warzone})</span>
      </div>
      <div class="intel-meta">
        ${a.isNCA
          ? "Non-Competitive"
          : a.stabilityFactor < 0.8
            ? "Fragile"
            : "Competitive"}
      </div>
    </div>

    <!-- PIE -->
   <div class="intel-pie">
  <canvas id="pie-${a.alliance}-${a.warzone}"></canvas>

  <div class="pie-rank">
    Rank <strong>#${index + 1}</strong>
  </div>

  <div class="pie-label">Composition</div>
</div>


    <!-- COMBAT -->
    <div class="combat-number">
      Combat Power: <strong>${formatBig(a.acsAbsolute)}</strong>
    </div>

    <!-- MARQUEE -->
    <div class="marquee">
      ${marquee.map((p, i) => `
        <div class="marquee-player">
          <span>${i + 1}. ${p.name}</span>
          <span>${formatPower(p.firstSquadPower)}</span>
        </div>
      `).join("")}
    </div>

    <!-- BARS -->
   ${(() => {
  const level = getRankLevel(index + 1, alliances.length);
  const winPct = Math.round((a.winProbability || 0) * 100);

  return `
    <div class="intel-bars">
      <canvas id="bars-${a.alliance}-${a.warzone}"></canvas>

      <div class="bar-overlay">
        <span class="rank-level ${level.class}">
          ${level.label}
        </span>
        <span class="win-percent">
          ${winPct}% WIN
        </span>
      </div>
    </div>
  `;
})()}

<div class="intel-bars">
      <canvas id="bars-${a.alliance}-${a.warzone}"></canvas>
    </div>

  </div>
`
;

    el.appendChild(card);

    setTimeout(() => {
      renderAllianceBars(a);
      renderAlliancePie(a);
    }, 0);
  });
}

/* =============================
   CHARTS
============================= */
function renderAllianceBars(a) {
  const ctx = document
    .getElementById(`bars-${a.alliance}-${a.warzone}`)
    .getContext("2d");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Win %", "Total", "Frontline", "Depth", "Stability"],
      datasets: [{
  data: [
  
  clamp((a.winProbability || 0) * 100, 5, 100), // 🔥 Probability bar
  normalizeTotalPower(a.totalAlliancePower),
  normalizeFSP(a.averageFirstSquadPower),
  normalizeDepth(a.benchPower / (a.activePower || 1)),
  normalizeStability(a.stabilityFactor)
],

  
  // 👇 THESE ARE THE LABELS SHOWN ABOVE BARS
  rawValues: [
  Math.round((a.winProbability || 0) * 100) + "%",
  formatBig(a.totalAlliancePower),
  formatPower(a.averageFirstSquadPower),
  Math.round((a.benchPower / a.activePower) * 100) + "%",
  Math.round(a.stabilityFactor * 100) + "%"
],


  backgroundColor: [
  "#f5c542",    // 🟡 Win %
  "#1e90ff",    // Total
  "#bb7467ff",  // Frontline
  "#2eca74ff",  // Depth
  "#13a787ff"   // Stability
]

}]
    },
options: {
  responsive: true,
  maintainAspectRatio: false,

  layout: {
    padding: {
      top: 18   // 👈 space for numbers above bars
    }
  },

  plugins: {
    legend: { display: false },
    tooltip: { enabled: false } // numbers already visible
  },

  scales: {
    x: {
      ticks: {
        color: "#bdfdf0",
        font: { size: 11 }
      },
      grid: { display: false }
    },
    y: {
      min: 0,
      max: 100,
      ticks: { display: false },
      grid: { display: false }
    }
  }
},
plugins: [BarValuePlugin]   // 👈 REQUIRED
});
}

function renderAlliancePie(a) {
  const ctx = document
    .getElementById(`pie-${a.alliance}-${a.warzone}`)
    .getContext("2d");

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(a.tierCounts),
      datasets: [{
        data: Object.values(a.tierCounts)
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      cutout: "55%"
    }
  });
}
// Phase 4 — effective power for showdown
function getEffectivePowerValue(p) {
  if (p.powerSource === "confirmed") return p.basePower;

  if (!p.lastConfirmedAt || !p.lastConfirmedAt.toMillis) {
    return p.basePower;
  }

  const weeks =
    Math.floor((Date.now() - p.lastConfirmedAt.toMillis()) / (1000 * 60 * 60 * 24 * 7));

  if (weeks <= 0) return p.basePower;

  let rate = 0.03;
  if (p.basePower >= 400_000_000) rate = 0.007;
  else if (p.basePower >= 200_000_000) rate = 0.018;
  else if (p.basePower >= 100_000_000) rate = 0.024;

  return Math.round(p.basePower * Math.pow(1 + rate, weeks));
}
function renderWinProbabilitySummary(alliances) {
  const container = document.getElementById("results");
  if (!container) return;

  const probs = computeWinProbabilities(alliances);

  let html = `
    <h2>Winning Probability</h2>
    <div class="probability-list">
  `;

  alliances.forEach((a, i) => {
    const p = Math.round(probs[a.alliance] * 100);

    html += `
      <div class="prob-row rank-${i + 1}">
        <span>#${i + 1} ${a.alliance}</span>
        <strong>${p}%</strong>
      </div>
    `;
  });

  html += `</div>`;
  container.insertAdjacentHTML("beforeend", html);
}

/* =============================
   HELPERS
============================= */
function computeTotalAlliancePower(a) {
  return a.activePlayers
    .filter(p => !p.assumed)
   .reduce((s, p) => s + getEffectivePowerValue(p), 0);
}
function formatBig(v) {
  if (!v) return "0";

  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9)  return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6)  return (v / 1e6).toFixed(1) + "M";

  return Math.round(v).toString();
}



const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const normalizeTotalPower = v => clamp(v / 2e10 * 100, 5, 100);
const normalizeFSP = v => clamp(v / 1.2e8 * 100, 5, 100);
const normalizeDepth = v => clamp(v * 100, 5, 100);
const normalizeStability = v => clamp(v * 100, 5, 100);
const formatPower = v => (v / 1e6).toFixed(1) + "M";
function computeCombatScore(a) {
  const frontlineFactor = normalizeFSP(a.averageFirstSquadPower) / 100;

  return (
    a.totalAlliancePower *
    a.stabilityFactor *
    (0.6 + 0.4 * frontlineFactor)
  );
}
