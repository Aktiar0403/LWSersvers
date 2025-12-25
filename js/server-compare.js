import { db } from "./firebase-config.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  /* =============================
   PHASE 4 — POWER COMPUTATION
============================= */

function getWeeklyGrowthRate(basePower) {
  if (basePower < 50_000_000) return 0.03;
  if (basePower < 100_000_000) return 0.024;
  if (basePower < 200_000_000) return 0.018;
  if (basePower < 400_000_000) return 0.012;
  return 0.007;
}

function weeksBetween(timestamp) {
  if (!timestamp || !timestamp.toMillis) return 0;
  const diffMs = Date.now() - timestamp.toMillis();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
}

function computeEffectivePower(p) {
  if (p.powerSource === "confirmed") {
    return p.basePower;
  }

  const weeks = weeksBetween(p.lastConfirmedAt);
  if (weeks <= 0) return p.basePower;

  const rate = getWeeklyGrowthRate(p.basePower);
  return Math.round(p.basePower * Math.pow(1 + rate, weeks));
}

function getEffectivePowerValue(p) {
  return computeEffectivePower(p);
}


  function estimateFirstSquad(totalPower) {
  const m = totalPower / 1_000_000;

  // Endgame whales – high variance
  if (m >= 450) return "105–125M";
  if (m >= 400) return "100–120M";
  if (m >= 350) return "90–110M";
  if (m >= 300) return "80–100M";

  // Upper-mid – growing variance
  if (m >= 260) return "72–85M";
  if (m >= 230) return "68–78M";
  if (m >= 200) return "64–72M";
  if (m >= 180) return "60–68M";

  // Mid game – controlled builds
  if (m >= 160) return "55–60M";
  if (m >= 150) return "52–56M";
  if (m >= 140) return "49–53M";
  if (m >= 130) return "47–50M";
  if (m >= 120) return "45–48M";
  if (m >= 110) return "43–46M";

  // Early
  return "40–43M";
}


let compareChart = null;
let allPlayers = [];
let mode = "alliance";

const selectA = document.getElementById("selectA");
const selectB = document.getElementById("selectB");
const compareBtn = document.getElementById("compareBtn");
const results = document.getElementById("compareResults");
const verdictCard = document.getElementById("verdictCard");

const TIERS = {
  mega: p => p >= 230_000_000,
  whale: p => p >= 180_000_000 && p < 230_000_000,
  shark: p => p >= 160_000_000 && p < 180_000_000,
  piranha: p => p >= 140_000_000 && p < 160_000_000,
  shrimp: p => p < 140_000_000
};

async function loadPlayers() {
  const snap = await getDocs(collection(db,"server_players"));
  allPlayers = snap.docs.map(doc => {
  const d = doc.data();
  return {
    ...d,
    basePower: Number(d.basePower ?? d.totalPower ?? 0),
    powerSource: d.powerSource || "confirmed",
    lastConfirmedAt: d.lastConfirmedAt || d.importedAt
  };
});

  populateSelectors();
}

function populateSelectors() {
  const values = [...new Set(
    allPlayers.map(p => mode === "alliance" ? p.alliance : p.warzone)
  )].sort((a, b) => String(a).localeCompare(String(b)));

  selectA.innerHTML = selectB.innerHTML = "";

  values.forEach(v => {
    selectA.innerHTML += `<option>${v}</option>`;
    selectB.innerHTML += `<option>${v}</option>`;
  });

  if (mode === "alliance") {
    // ✅ Alliance = searchable
    searchA.style.display = "block";
    searchB.style.display = "block";

    bindSearch(searchA, selectA, values);
    bindSearch(searchB, selectB, values);

  } else {
    // ✅ Warzone = NOT searchable
    searchA.style.display = "none";
    searchB.style.display = "none";
  }
}

function getTop10(players) {
  return [...players]
    .sort((a, b) => getEffectivePowerValue(b) - getEffectivePowerValue(a))
    .slice(0, 10);
}


function analyze(players) {
  const stats = { mega:0, whale:0, shark:0, piranha:0, shrimp:0, total:0 };

  players.forEach(p => {
    const pw = getEffectivePowerValue(p);
    stats.total += pw;
    if (TIERS.mega(pw)) stats.mega++;
    else if (TIERS.whale(pw)) stats.whale++;
    else if (TIERS.shark(pw)) stats.shark++;
    else if (TIERS.piranha(pw)) stats.piranha++;
    else stats.shrimp++;
  });

  return stats;
}
const valueLabelPlugin = {
  id: "valueLabel",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;

    ctx.save();
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);

      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (value === 0) return;

        ctx.fillStyle = "#eafffb";
        ctx.font = "bold 11px Inter, system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        ctx.fillText(
          value,
          bar.x,
          bar.y - 4
        );
      });
    });
    ctx.restore();
  }
};

function renderChart(labelA, labelB, statsA, statsB) {

  const ctx = document.getElementById("compareChart").getContext("2d");

  if (compareChart) {
    compareChart.destroy();
  }

  compareChart = new Chart(ctx, {
  type: "bar",
  data: {
    labels: [
      "Mega Whales",
      "Whales",
      "Sharks",
      "Piranhas",
      "Shrimps"
    ],
    datasets: [
      {
        label: labelA,
        data: [
          statsA.mega,
          statsA.whale,
          statsA.shark,
          statsA.piranha,
          statsA.shrimp
        ],
        backgroundColor: "rgba(0,255,200,0.75)"
      },
      {
        label: labelB,
        data: [
          statsB.mega,
          statsB.whale,
          statsB.shark,
          statsB.piranha,
          statsB.shrimp
        ],
        backgroundColor: "rgba(0,180,255,0.65)"
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        labels: { color: "#e6eef0" }
      }
    },
    scales: {
      x: {
        ticks: { color: "#93a3a6" },
        grid: { color: "rgba(255,255,255,0.05)" }
      },
      y: {
        ticks: { color: "#93a3a6", precision: 0 },
        grid: { color: "rgba(255,255,255,0.05)" },
        beginAtZero: true
      }
    }
  },
  plugins: [valueLabelPlugin]   // 🔥 THIS LINE
});

}
function renderTop10(labelA, listA, labelB, listB) {
  document.getElementById("top10Compare").classList.remove("hidden");

  document.getElementById("top10TitleA").textContent = `TOP 10 – ${labelA}`;
  document.getElementById("top10TitleB").textContent = `TOP 10 – ${labelB}`;

  const listAEl = document.getElementById("top10ListA");
  const listBEl = document.getElementById("top10ListB");

  listAEl.innerHTML = "";
  listBEl.innerHTML = "";

  for (let i = 0; i < 10; i++) {
    const a = listA[i];
    const b = listB[i];

    const aPower = a ? getEffectivePowerValue(a) : 0;
const bPower = b ? getEffectivePowerValue(b) : 0;

    let medalA = "";
    let medalB = "";

    if (aPower > bPower) {
      medalA = "🏆";
    } else if (bPower > aPower) {
      medalB = "🏆";
    } else if (aPower && bPower) {
      medalA = medalB = "🤝";
    }

    listAEl.innerHTML += `
      <div class="elite-row ${medalA ? "winner" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="name">${a ? a.name : "—"}</span>
        <span class="power">
  ${a ? Math.round(aPower / 1e6) + "M" : "—"}
  ${a ? `<div class="sub-power">⚔️ S1 ${estimateFirstSquad(aPower)}</div>` : ""}
</span>

        <span class="medal">${medalA}</span>
      </div>
    `;

    listBEl.innerHTML += `
      <div class="elite-row ${medalB ? "winner" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="name">${b ? b.name : "—"}</span>
       <span class="power">
  ${b ? Math.round(bPower / 1e6) + "M" : "—"}
  ${b ? `<div class="sub-power">⚔️ S1 ${estimateFirstSquad(bPower)}</div>` : ""}
</span>

        <span class="medal">${medalB}</span>
      </div>
    `;
  }
}

compareBtn.onclick = () => {
  const A = selectA.value;
  const B = selectB.value;

  const aPlayers = allPlayers.filter(p =>
    mode === "alliance" ? p.alliance === A : p.warzone == A
  );
  const bPlayers = allPlayers.filter(p =>
    mode === "alliance" ? p.alliance === B : p.warzone == B
  );

  const a = analyze(aPlayers);
  const b = analyze(bPlayers);
    const totalA = sumPower(aPlayers);
    const totalB = sumPower(bPlayers);

    const topA = getTopPlayer(aPlayers);
    const topB = getTopPlayer(bPlayers);

    const top10A = getTop10(aPlayers);
    const top10B = getTop10(bPlayers);

   renderTop10(A, top10A, B, top10B);

    document.getElementById("analysisPanel").classList.remove("hidden");

    // Winner
    document.getElementById("analysisWinner").textContent =
  totalA > totalB ? A : B;

    // Total Power
    document.getElementById("analysisTotalPower").textContent =
  `${A}: ${Math.round(totalA / 1e6)}M vs ${B}: ${Math.round(totalB / 1e6)}M`;

   document.getElementById("analysisTopPlayer").textContent =
  topA && topB
    ? `${topA.name} (${Math.round(topA.totalPower / 1e6)}M | ⚔️ S1 ${estimateFirstSquad(topA.totalPower)}) 
       vs 
       ${topB.name} (${Math.round(topB.totalPower / 1e6)}M | ⚔️ S1 ${estimateFirstSquad(topB.totalPower)})`
    : "—";


  // ✅ CHART STYLE (THIS REPLACES renderBar)
  renderChart(A, B, a, b);

  // ✅ Tactical verdict
  verdictCard.classList.remove("hidden");
  verdictCard.textContent =
    a.mega > b.mega
      ? `${A} shows higher elite concentration due to stronger Mega Whale presence.`
      : `${B} holds a stronger elite edge based on Mega Whale distribution.`;
};


document.querySelectorAll(".mode-btn").forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
    populateSelectors();
  };
});

loadPlayers();
function bindSearch(inputEl, selectEl, values) {
  inputEl.oninput = () => {
    const q = inputEl.value.toLowerCase();
    selectEl.innerHTML = "";

    values
      .filter(v => String(v).toLowerCase().includes(q))
      .forEach(v => {
        selectEl.innerHTML += `<option>${v}</option>`;
      });
  };
}
function sumPower(players) {
  return players.reduce(
    (sum, p) => sum + getEffectivePowerValue(p),
    0
  );
}

function getTopPlayer(players) {
  if (!players.length) return null;

  return players.reduce((max, p) =>
    getEffectivePowerValue(p) > getEffectivePowerValue(max) ? p : max
  );
}
