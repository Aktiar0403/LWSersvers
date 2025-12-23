console.log("✅ Server Intelligence JS loaded");
import { logout } from "./auth.js";
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  increment,
  setDoc,
  getDocs,
  getDoc,
  addDoc,
  query,
  where,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 🔐 Global admin flag (default false)
window.IS_ADMIN = false;

let editingPlayer = null;
let LIKES_ENABLED = false;

let globalLimit = 20;
const GLOBAL_LIMITS = [20, 50, 100];

/* =============================
   PHASE 4 — POWER COMPUTATION
============================= */

// Decide weekly growth % based on base power
function getWeeklyGrowthRate(basePower) {
  if (basePower < 50_000_000) return 0.03;   // 3.0%
  if (basePower < 100_000_000) return 0.024; // 2.4%
  if (basePower < 200_000_000) return 0.018; // 1.8%
  if (basePower < 400_000_000) return 0.012; // 1.2%
  return 0.007;                              // 0.7%
}

// How many full weeks since last confirmation
function weeksBetween(timestamp) {
  if (!timestamp || !timestamp.toMillis) return 0;

  const diffMs = Date.now() - timestamp.toMillis();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
}

// Final computed power shown to users
function computeEffectivePower(player) {
  // If power is confirmed, show exact
  if (player.powerSource === "confirmed") {
    return {
      value: player.basePower,
      tag: "confirmed"
    };
  }

  const weeks = weeksBetween(player.lastConfirmedAt);
  if (weeks <= 0) {
    return {
      value: player.basePower,
      tag: "estimated"
    };
  }

  const rate = getWeeklyGrowthRate(player.basePower);
  const grown = player.basePower * Math.pow(1 + rate, weeks);

  return {
    value: Math.round(grown),
    tag: "estimated"
  };
}
async function loadAppConfig() {
  try {
    const ref = doc(db, "app_config", "global");
    const snap = await getDoc(ref);

    if (snap.exists()) {
      LIKES_ENABLED = snap.data().likesEnabled === true;
    } else {
      LIKES_ENABLED = false;
    }
  } catch (e) {
    console.warn("Failed to load app config", e);
    LIKES_ENABLED = false;
  }
}


// Always use this for power everywhere (Phase 4 helper)
function getEffectivePowerValue(p) {
  return computeEffectivePower(p).value;
}


function renderPagedPlayers(players) {
  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const slice = players.slice(start, end);
  
  renderPlayerCards(slice, start);
  updateLoadMoreVisibility(players.length);
}

function updateLoadMoreVisibility(totalCount) {
  if (!loadMoreBtn) return;

  const shown = (currentPage + 1) * PAGE_SIZE;

  if (shown >= totalCount) {
    loadMoreBtn.style.display = "none";
  } else {
    loadMoreBtn.style.display = "block";
  }
}


// =============================
// PHASE 4.1 — CACHE COMPUTED POWER
// =============================
function hydrateComputedFields(players) {
  players.forEach(p => {
    const res = computeEffectivePower(p);
    p._effectivePower = res.value;
    p._powerTag = res.tag;
  });
}
// =============================
// PHASE 4.2 — PRE-SORT INDEX (10K SAFE)
// =============================
function prepareSortedIndexes() {
  SORTED_BY_POWER = [...allPlayers].sort(
    (a, b) => b._effectivePower - a._effectivePower
  );
   console.log("🧪 Sorted index prepared:", SORTED_BY_POWER.length);
}


const loaderStart = Date.now();
let fakeProgress = 0;
let dataReady = false;
let progressRAF = null;

const progressText = document.getElementById("progressText");
const progressCircle = document.querySelector(".progress-ring .progress");

function setProgress(pct) {
  fakeProgress = pct;
  const dash = 163 - (163 * pct) / 100;
  progressCircle.style.strokeDashoffset = dash;
  progressText.textContent = pct + "%";
}

function startFakeProgress() {
  const maxFake = 88;

  function tick() {
    if (dataReady) return;

    let speed = 0.5;
    if (fakeProgress > 30) speed = 0.35;
    if (fakeProgress > 60) speed = 0.2;
    if (fakeProgress >= maxFake) speed = 0;

    fakeProgress = Math.min(fakeProgress + speed, maxFake);
    setProgress(Math.floor(fakeProgress));

    progressRAF = requestAnimationFrame(tick);
  }

  tick();
}


function hideLoader() {
  const loader = document.getElementById("appLoader");
  if (!loader) return;

  const elapsed = Date.now() - loaderStart;
  const delay = Math.max(0, 800 - elapsed);

  setTimeout(() => {
    loader.classList.add("hide");
  }, delay);
}
function completeProgress() {
  cancelAnimationFrame(progressRAF);

  let current = fakeProgress;

  function finish() {
    if (current >= 100) {
      setProgress(100);
      hideLoader();
      return;
    }

    current += 2;
    setProgress(current);
    requestAnimationFrame(finish);
  }

  finish();
}
function timeAgo(date) {
  if (!date) return "";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";

  return `${days} days ago`;
}



function getPowerMeta(player) {
  if (player.powerSource === "confirmed") {
    const date =
      player.lastConfirmedAt?.toDate?.() ||
      player.overrideAt?.toDate?.() ||
      player.importedAt?.toDate?.();

    if (!date) return "Updated";

    return `Updated: ${timeAgo(date)}`;
  }

  return "Computed";
}



function formatPowerM(power) {
  if (!power) return "0M";
  return Math.round(power / 1_000_000) + "M";
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


/* =============================
   STATE
============================= */
let allPlayers = [];
let filteredPlayers = [];
let SORTED_BY_POWER = [];
let activeWarzone = "ALL";
let activeAlliance = "ALL";
let dominanceSelectedAlliance = null;
const PAGE_SIZE = 50;
let currentPage = 0;


/* =============================
   DOM
============================= */
const $ = id => document.getElementById(id);

const searchInput = $("searchInput");
const warzoneCards = $("warzoneCards");
const allianceCards = $("allianceCards");
const tableBody = $("tableBody");

const dominanceGrid = $("dominanceGrid");

const pasteData = $("pasteData");
const saveBtn = $("saveBtn");
const dominanceSection = document.getElementById("dominanceSection");



if (dominanceSection) dominanceSection.style.display = "none";
const globalTopToggle = document.getElementById("globalTopToggle");
const globalTopTitle = document.getElementById("globalTopTitle");
const globalTopSub = document.getElementById("globalTopSub");

function updateGlobalTopCard() {
  globalTopTitle.textContent = `TOP ${globalLimit}`;
  globalTopSub.textContent = `Global top ${globalLimit} players`;
}

globalTopToggle.onclick = () => {
  // Only active in GLOBAL mode
  if (activeWarzone !== "ALL") return;

  const idx = GLOBAL_LIMITS.indexOf(globalLimit);
  globalLimit = GLOBAL_LIMITS[(idx + 1) % GLOBAL_LIMITS.length];

  updateGlobalTopCard();
  applyFilters();
};

// init
updateGlobalTopCard();


/* =============================
   TOP 5 ELITE PLAYERS
============================= */
function renderTop5Elite(players) {
  const grid = document.getElementById("top5Grid");
  if (!grid) return;

  // Sort by TOTAL POWER (global, not filtered)
  const top5 = [...players]
 .sort((a, b) => getEffectivePowerValue(b) - getEffectivePowerValue(a))
    .slice(0, 5);

  grid.innerHTML = "";

  top5.forEach((p, index) => {
    const card = document.createElement("div");
    card.className = `glory-card rank-${index + 1}`;

    card.innerHTML = `
      <div class="rank-badge">#${index + 1}</div>

      <div class="glory-name">${p.name}</div>

      <div class="glory-meta">
        <span class="alliance">${p.alliance || "—"}</span>
        <span class="warzone">WZ-${p.warzone}</span>
      </div>

      <div class="glory-power">⚡ ${formatPowerM(getEffectivePowerValue(p))}</div>
    `;

    grid.appendChild(card);
  });
}


function updateLastUpdated(players) {
  const el = document.getElementById("lastUpdated");
  if (!el || !players.length) {
    if (el) el.textContent = "—";
    return;
  }

  const dates = players
    .map(p => {
      return (
        p.lastConfirmedAt?.toDate?.() ||
        p.overrideAt?.toDate?.() ||
        p.importedAt?.toDate?.() ||
        null
      );
    })
    .filter(Boolean);

  if (!dates.length) {
    el.textContent = "Unknown";
    return;
  }

  const latest = dates.sort((a, b) => b - a)[0];

  el.textContent = latest.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

startFakeProgress();

/* =============================
   LOAD FROM FIRESTORE
============================= */
async function loadPlayers() {
  console.log("📡 Loading server_players from Firestore...");

  try {
    // 🟢 Stage 1: Connecting
    setProgress(10);

    const snap = await getDocs(collection(db, "server_players"));

    // 🟢 Stage 2: Data received
    setProgress(40);

    allPlayers = snap.docs.map(doc => {
      const d = doc.data();
    return {
  id: doc.id,
  rank: Number(d.rank ?? 0),
  name: d.name || "",
  alliance: d.alliance || "",
  warzone: Number(d.warzone),

    totalPower: Number(d.totalPower ?? 0), // keep for admin
   basePower: Number(d.basePower ?? d.totalPower ?? 0),
   powerSource: d.powerSource || "confirmed",
   lastConfirmedAt: d.lastConfirmedAt || d.importedAt
  };

    });

    // 🔥 PHASE 4.1 — CACHE COMPUTED POWER (CRITICAL)
    hydrateComputedFields(allPlayers);
    prepareSortedIndexes();

    console.log("✅ Loaded players:", allPlayers.length);
    const likesMap = await loadLikesForPlayers(allPlayers);
   window.PLAYER_LIKES = likesMap;


    // 🟢 Stage 3: Processing & building UI
    setProgress(70);

    // 🔥 RESET FILTERS AFTER LOAD
    activeWarzone = "ALL";
    activeAlliance = "ALL";

    // 🔥 REBUILD FILTER UI
    //buildWarzoneCards();

    // 🔥 APPLY FILTERS
    applyFilters();

    // 🏆 TOP 5 ELITE
    renderTop5Elite(allPlayers);

    updateLastUpdated(allPlayers);


    // 🟢 Stage 4: Ready
    setProgress(100);

    hideLoader(); // ✅ DATA READY

  } 
  catch (err) {
    console.error("❌ Failed to load server_players:", err);

    // ⚠️ Always hide loader even on error
    hideLoader();
  }
}

async function loadLikesForPlayers(players) {
  const likesSnap = await getDocs(collection(db, "player_likes"));

  const map = {};
  likesSnap.forEach(doc => {
    map[doc.id] = doc.data().count || 0;
  });

  return map;
}

function applyFilters() {

  const q = searchInput.value.trim().toLowerCase();

  // 🌍 ==========================
  // 🌍 GLOBAL MODE (TOP ONLY)
  // 🌍 ==========================
  if (activeWarzone === "ALL") {

    // Always start clean
    filteredPlayers = [...allPlayers];

    // 🔍 Apply search ONLY on global list
    if (q) {
      filteredPlayers = filteredPlayers.filter(p =>
        p.name.toLowerCase().includes(q)
      );
    }

// 🌍 ==========================
// 🌍 GLOBAL MODE (TOP ONLY)
// 🌍 ==========================
if (activeWarzone === "ALL") {

  // Always start from pre-sorted index
  filteredPlayers = SORTED_BY_POWER;

  // 🔍 Search
  if (q) {
    filteredPlayers = filteredPlayers.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }

  // ✂️ Top slice
  filteredPlayers = filteredPlayers.slice(0, globalLimit);

  // 🔄 Render
  currentPage = 0;
renderPagedPlayers(filteredPlayers);


  // 📊 Stats
  updatePowerSegments(filteredPlayers);
  updateOverviewStats(allPlayers);

  // 🚫 No dominance in global
  dominanceSection.style.display = "none";
  dominanceGrid.innerHTML = "";

  return; // ⛔ IMPORTANT
}


    // ✂️ Slice by TOP limit
    filteredPlayers = filteredPlayers.slice(0, globalLimit);

    // 🔄 Render
    currentPage = 0;
renderPagedPlayers(filteredPlayers);


    // 📊 Stats (global)
    updatePowerSegments(filteredPlayers);
    updateOverviewStats(allPlayers);

    // 🚫 No dominance in global
    dominanceSection.style.display = "none";
    dominanceGrid.innerHTML = "";

    return; // ⛔ IMPORTANT — stop here
  }

  // 🎯 ==========================
  // 🎯 WARZONE MODE
  // 🎯 ==========================
  filteredPlayers = allPlayers.filter(
    p => p.warzone === Number(activeWarzone)
  );

  // 🔍 Search
  if (q) {
    filteredPlayers = filteredPlayers.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }

  // 🧬 Alliance filter
  if (activeAlliance !== "ALL") {
    filteredPlayers = filteredPlayers.filter(
      p => p.alliance === activeAlliance
    );
  }

  // 🎯 ==========================
// 🎯 WARZONE MODE
// 🎯 ==========================
filteredPlayers = SORTED_BY_POWER.filter(
  p => p.warzone === Number(activeWarzone)
);

// 🔍 Search
if (q) {
  filteredPlayers = filteredPlayers.filter(p =>
    p.name.toLowerCase().includes(q)
  );
}

// 🧬 Alliance filter
if (activeAlliance !== "ALL") {
  filteredPlayers = filteredPlayers.filter(
    p => p.alliance === activeAlliance
  );
}

// 🔄 Render
currentPage = 0;
renderPagedPlayers(filteredPlayers);


// 📊 Stats
updatePowerSegments(filteredPlayers);
updateOverviewStats(allPlayers);

// 👑 Dominance
dominanceSection.style.display = "block";
renderAllianceDominance(filteredPlayers);


  // 🔄 Render
  currentPage = 0;
renderPagedPlayers(filteredPlayers);


  // 📊 Stats
  updatePowerSegments(filteredPlayers);
  updateOverviewStats(allPlayers);

  // 👑 Dominance
  dominanceSection.style.display = "block";
  renderAllianceDominance(filteredPlayers);
}


/* =============================
   TABLE (FINAL – Phase 5.5 UI)
============================= */
function renderPlayerCards(players, rankOffset = 0) {
  const list = document.getElementById("playerList");
  if (!list) return;

  if (rankOffset === 0) {
  list.innerHTML = "";
}


  players.forEach((p, index) => {
    const effectivePower = p._effectivePower;
    const powerTag = p._powerTag;
    const powerM = Math.round(effectivePower / 1_000_000);
    const firstSquad = estimateFirstSquad(effectivePower);

    const card = document.createElement("div");
    card.className = "player-card";


    card.innerHTML = `
      <div class="pc-main">
  <div class="pc-rank">#${rankOffset + index + 1}</div>


  <div class="pc-info">
    <div class="pc-name">${p.name}</div>
    <div class="pc-meta">
  WZ ${p.warzone} •
  <span class="alliance-name">
    ${p.alliance || "—"}
  </span>
</div>

   
  </div>

 <div class="pc-right">
  <div class="pc-power">
    <span class="pc-power-value">${powerM}</span><span class="pc-power-unit">m</span>

  </div>
   <div
    class="pc-squad"
    title="Estimated squad power"
  >
    ⚔️ ${firstSquad}
  </div>

  <div class="pc-power-meta ${powerTag}">
    ${getPowerMeta(p)}
  </div>

${LIKES_ENABLED ? `
  <div class="pc-like">
    <button
      class="like-btn"
      data-id="${p.id}"
      aria-label="Like player"
    >
      ❤️ <span class="like-count">0</span>
    </button>
  </div>
` : ``}


</div>

</div>


        ${
          window.IS_ADMIN
            ? `<button class="pc-edit" onclick="openEditPower('${p.id}')">✏️ Edit</button>`
            : ``
        }
      </div>
    `;

    list.appendChild(card);
  });
}

const likesMap = await loadLikesForPlayers(allPlayers);
window.PLAYER_LIKES = likesMap;

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".like-btn");
  if (!btn) return;

  const playerId = btn.dataset.id;

  // 🔒 Device lock
  const liked =
    JSON.parse(localStorage.getItem("liked_players") || "[]");

  if (liked.includes(playerId)) {
    alert("You already liked this player ❤️");
    return;
  }

  // ✅ Optimistic UI update
  const countEl = btn.querySelector(".like-count");
  countEl.textContent = Number(countEl.textContent) + 1;

  // 🔐 Save device lock
  liked.push(playerId);
  localStorage.setItem("liked_players", JSON.stringify(liked));

  // 🔁 Firestore atomic increment
  const ref = doc(db, "player_likes", playerId);

  try {
    await updateDoc(ref, {
      count: increment(1)
    });
  } catch {
    // First like ever → create doc
    await setDoc(ref, { count: 1 });
  }
});



/* =============================
   WARZONE FILTER
============================= */
function buildWarzoneCards() {
  const zones = [...new Set(allPlayers.map(p => p.warzone))].sort((a,b)=>a-b);

  warzoneCards.innerHTML = "";

  createFilterCard("All", "ALL", warzoneCards, v => {
    activeWarzone = "ALL";
    activeAlliance = "ALL";
    allianceCards.innerHTML = "";
    applyFilters();
  });

  zones.forEach(z => {
    createFilterCard(z, z, warzoneCards, v => {
     activeWarzone = Number(v);
      activeAlliance = "ALL";
      dominanceSelectedAlliance = null;
      buildAllianceCards(v);
applyFilters();

    });
  });
}

/* =============================
   ALLIANCE FILTER (PER WARZONE)
============================= */
function buildAllianceCards(zone) {
  allianceCards.innerHTML = "";

  const alliances = [
    ...new Set(
      allPlayers
        .filter(p => p.warzone === Number(zone))
        .map(p => p.alliance)
    )
  ].sort();

  createFilterCard("All", "ALL", allianceCards, v => {
    activeAlliance = "ALL";
    applyFilters();
  });

  alliances.forEach(a => {
    createFilterCard(a, a, allianceCards, v => {
      activeAlliance = v;
      applyFilters();
    });
  });
}

/* =============================
   GENERIC CARD
============================= */
function createFilterCard(label, value, container, onClick) {
  const card = document.createElement("div");
  card.className = "filter-card";
  card.textContent = label;

  card.onclick = () => {
    [...container.children].forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    onClick(value);
  };

  container.appendChild(card);
}

/* =============================
   POWER SEGMENTS
============================= */
function updatePowerSegments(players) {
  let mega = 0, whale = 0, shark = 0, piranha = 0, shrimp = 0;

  players.forEach(p => {
    const power = getEffectivePowerValue(p);

    if (power >= 230_000_000) mega++;
    else if (power >= 180_000_000) whale++;
    else if (power >= 160_000_000) shark++;
    else if (power >= 140_000_000) piranha++;
    else shrimp++;
  });

  setText("megaWhaleCount", mega);
  setText("whaleCount", whale);
  setText("sharkCount", shark);
  setText("piranhaCount", piranha);
  setText("shrimpCount", shrimp);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* =============================
   ALLIANCE DOMINANCE (TOP 5)
============================= */
function renderAllianceDominance(players) {
  dominanceGrid.innerHTML = "";

  const map = {};
  let total = 0;

  players.forEach(p => {
 const power = getEffectivePowerValue(p);
map[p.alliance] = (map[p.alliance] || 0) + power;
total += power;
  });

  Object.entries(map)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([alliance, power], index) => {

    const isSelected = dominanceSelectedAlliance === alliance;
    const pct = ((power / total) * 100).toFixed(1);

    const members = players.filter(p => p.alliance === alliance);
    const topPlayer = members.sort(
  (a,b)=>getEffectivePowerValue(b)-getEffectivePowerValue(a)
)[0];

    const card = document.createElement("div");
    card.className = "dominance-card";
    card.dataset.alliance = alliance;

    card.innerHTML = isSelected
      ? `
        <div class="dom-rank">#${index + 1}</div>
        <div class="dom-name">${alliance}</div>

        <div class="dom-insight">⚡ ${formatPowerM(power)} Total</div>
        <div class="dom-insight">👑 ${topPlayer?.name || "—"}</div>
        <div class="dom-insight">👥 ${members.length} In Top 200</div>
      `
      : `
        <div class="dom-rank">#${index + 1}</div>
        <div class="dom-name">${alliance}</div>
        <div class="dom-bar"><span style="width:${Math.min(pct,92)}%"></span></div>
        <div class="dom-meta">${pct}%</div>
      `;

    card.onclick = () => {
      dominanceSelectedAlliance =
        dominanceSelectedAlliance === alliance ? null : alliance;
      applyFilters();
    };

    dominanceGrid.appendChild(card);
  });

}


/* =============================
   ADMIN IMPORT (PASTE)
============================= */
saveBtn.onclick = async () => {
  const lines = pasteData.value.split("\n").filter(Boolean);

  for (const line of lines) {
    const [rank, alliance, name, warzone, power] =
      line.split("|").map(s => s.trim());

    await addDoc(collection(db,"server_players"), {
      rank: Number(rank),
      alliance,
      name,
      warzone: Number(warzone),
      totalPower: Number(power),
      importedAt: serverTimestamp()
    });
  }

  alert("Data uploaded");
 
};
/* =============================
   ADMIN IMPORT (EXCEL / CSV)
============================= */
excelInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Remove header row
      rows.shift();

      if (!rows.length) {
        alert("Excel has no data rows");
        return;
      }

      let imported = 0;

    const uploadId = `upload-${Date.now()}`;

for (const row of rows) {
  if (row.length < 5) continue;

  const [rank, alliance, name, warzone, power] = row;

  const cleanName = String(name || "").trim();
  const wz = Number(warzone);
  const pwr = Number(power);

  if (!cleanName || !wz || !pwr) continue;

  // 🔍 Check if player already exists (name + warzone)
  const q = query(
    collection(db, "server_players"),
    where("name", "==", cleanName),
    where("warzone", "==", wz)
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    // 🔁 UPDATE existing player
    const docRef = snap.docs[0].ref;

    await updateDoc(docRef, {
      rank: Number(rank), // snapshot rank (admin-only)
      alliance: String(alliance || "").trim(),
      totalPower: pwr,

      // Phase 1 metadata refresh
      basePower: pwr,
      powerSource: "confirmed",
      lastConfirmedAt: serverTimestamp(),
      snapshotStatus: "present",
      uploadId: uploadId
    });

  } else {
    // 🆕 ADD new player
    await addDoc(collection(db, "server_players"), {
      rank: Number(rank),
      alliance: String(alliance || "").trim(),
      name: cleanName,
      warzone: wz,
      totalPower: pwr,

      // Phase 1 metadata
      basePower: pwr,
      powerSource: "confirmed",
      lastConfirmedAt: serverTimestamp(),
      snapshotStatus: "present",
      growthModel: "tiered-percent-v1",
      uploadId: uploadId,

      importedAt: serverTimestamp()
    });
  }

  imported++;
}

         alert(`✅ Imported ${imported} players from Excel`);
         excelInput.value = "";
        
    } catch (err) {
      console.error("Excel import failed:", err);
      alert("Excel import failed. Check console.");
    }
  };

  reader.readAsArrayBuffer(file);
};
async function deleteByUploadId(uploadId) {
  console.log("🧪 uploadId param:", uploadId);
  console.log("🧪 typeof uploadId:", typeof uploadId);

  const confirmText = prompt(
    `⚠️ This will permanently delete all players from upload:\n\n${uploadId}\n\nType: DELETE ${uploadId}`
  );

  console.log("🧪 typed:", confirmText);
  console.log("🧪 expected:", `DELETE ${uploadId}`);

  if (confirmText !== `DELETE ${uploadId}`) {
    alert("❌ Deletion cancelled");
    return;
  }

  const q = query(
    collection(db, "server_players"),
    where("uploadId", "==", uploadId)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    alert("No records found for this upload.");
    return;
  }

  let count = 0;

  for (const doc of snap.docs) {
    await deleteDoc(doc.ref);
    count++;
  }

  alert(`🗑️ Deleted ${count} players from upload ${uploadId}`);
}

window.deleteByUploadId = deleteByUploadId;
function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* =============================
   SEARCH
============================= */
searchInput.oninput = debounce(applyFilters, 200);


/* =============================
   INIT
============================= */
async function resolveAdminState() {
  try {
    window.IS_ADMIN = await checkIsAdmin();
  } catch (e) {
    window.IS_ADMIN = false;
  }
}






function updateOverviewStats(players) {
  const totalPlayers = players.length;

  const warzones = new Set(players.map(p => p.warzone));
  const alliances = new Set(players.map(p => p.alliance));

  document.getElementById("totalPlayers").textContent = totalPlayers;
  document.getElementById("totalWarzones").textContent = warzones.size;
  document.getElementById("totalAlliances").textContent = alliances.size;
}
function openEditPower(playerId) {
  // 🔐 ADMIN GUARD
  if (!window.IS_ADMIN) {
    console.warn("❌ Unauthorized edit attempt blocked");
    return;
  }

  const player = allPlayers.find(p => p.id === playerId);

  if (!player) {
    alert("❌ Player not found");
    return;
  }

  editingPlayer = player;

  document.getElementById("epPlayerName").textContent = player.name;
  document.getElementById("epWarzone").textContent = `WZ-${player.warzone}`;
  document.getElementById("epCurrentPower").textContent =
    Math.round(player.totalPower / 1e6) + "M";

  document.getElementById("epNewPower").value = "";
  document.getElementById("epHint").textContent =
    "Enter new power to continue";

  document.getElementById("epSaveBtn").disabled = true;

  document.getElementById("editPowerModal")
    .classList.remove("hidden");
}




function closeEditPowerModal() {
  editingPlayer = null;
  document.getElementById("editPowerModal")
    .classList.add("hidden");
}

window.openEditPower = openEditPower;
window.closeEditPowerModal = closeEditPowerModal;

const epNewPowerInput = document.getElementById("epNewPower");
const epSaveBtn = document.getElementById("epSaveBtn");
const epHint = document.getElementById("epHint");

epNewPowerInput.addEventListener("input", () => {
  if (!editingPlayer) return;

  const newPower = Number(epNewPowerInput.value);
  const currentPower = editingPlayer.totalPower;

  // ❌ Invalid number
  if (!newPower || newPower <= 0) {
    epSaveBtn.disabled = true;
    epHint.textContent = "❌ Enter a valid power number";
    return;
  }

  // ❌ Same as current
  if (newPower === currentPower) {
    epSaveBtn.disabled = true;
    epHint.textContent = "⚠️ New power is same as current";
    return;
  }

  // ⚠️ Too small (typo protection)
  if (newPower < currentPower * 0.5) {
    epSaveBtn.disabled = true;
    epHint.textContent =
      "⚠️ Power too low. Check for missing zeros.";
    return;
  }

  // ✅ Valid
  epSaveBtn.disabled = false;
  epHint.textContent = "✅ Ready to save";
});

epSaveBtn.onclick = async () => {
  // 🔐 ADMIN GUARD
  if (!window.IS_ADMIN) {
    alert("❌ Unauthorized action");
    return;
  }

  if (!editingPlayer) return;

  const newPower = Number(epNewPowerInput.value);
  if (!newPower || newPower <= 0) return;

  const ok = confirm(
    `Confirm power update?\n\n` +
    `${editingPlayer.name}\n` +
    `Old: ${Math.round(editingPlayer.totalPower / 1e6)}M\n` +
    `New: ${Math.round(newPower / 1e6)}M`
  );

  if (!ok) return;

  try {
    const ref = doc(db, "server_players", editingPlayer.id);

    await updateDoc(ref, {
      totalPower: newPower,
      basePower: newPower,
      powerSource: "confirmed",
      lastConfirmedAt: serverTimestamp(),
      overrideAt: serverTimestamp()
    });

    // 🔁 Sync local cache
    editingPlayer.totalPower = newPower;
    editingPlayer.basePower = newPower;
    editingPlayer.powerSource = "confirmed";
    editingPlayer.lastConfirmedAt = new Date();

    closeEditPowerModal();
    applyFilters();

    alert("✅ Power updated successfully");

  } catch (err) {
    console.error("Power update failed:", err);
    alert("❌ Failed to update power. Check console.");
  }
};

// =============================
// WARZONE MODAL LOGIC
// =============================
const warzoneModal = document.getElementById("warzoneModal");
const openWarzoneModalBtn = document.getElementById("openWarzoneModal");
const closeWarzoneModalBtn = document.getElementById("closeWarzoneModal");
const warzoneList = document.getElementById("warzoneList");
const warzoneSearchInput = document.getElementById("warzoneSearchInput");
const activeWarzoneLabel = document.getElementById("activeWarzoneLabel");

openWarzoneModalBtn.onclick = () => {
  warzoneModal.classList.remove("hidden");
  buildWarzoneModalList("");
};

closeWarzoneModalBtn.onclick = () => {
  warzoneModal.classList.add("hidden");
};

function buildWarzoneModalList(search) {
  warzoneList.innerHTML = "";

  const zones = [...new Set(allPlayers.map(p => p.warzone))]
    .sort((a,b)=>a-b)
    .filter(z => String(z).includes(search));

  // 🌍 ALL WARZONES CARD
  const allCard = document.createElement("div");
  allCard.className = "wz-card all";
  allCard.innerHTML = `
    <div class="wz-title">All Warzones</div>
    <div class="wz-sub">Global ranking</div>
  `;
 allCard.onclick = () => {
  activeWarzone = "ALL";
  activeAlliance = "ALL";
  dominanceSelectedAlliance = null;

  // ✅ CLEAR ALLIANCE GRID COMPLETELY
  allianceCards.innerHTML = "";

  activeWarzoneLabel.textContent = "All Warzones";
  warzoneModal.classList.add("hidden");
  applyFilters();
};

  warzoneList.appendChild(allCard);

  zones.forEach(z => {
    const card = document.createElement("div");
    card.className = "wz-card";
    card.innerHTML = `
      <div class="wz-title">${z}</div>
      
    `;
    card.onclick = () => {
      activeWarzone = Number(z);
      activeAlliance = "ALL";
      dominanceSelectedAlliance = null;
      // ✅ BUILD ALLIANCE PILLS AGAIN
        buildAllianceCards(z);
      activeWarzoneLabel.textContent = z;
      warzoneModal.classList.add("hidden");
      applyFilters();
    };
    warzoneList.appendChild(card);
  });
}


warzoneSearchInput.oninput = () => {
  buildWarzoneModalList(warzoneSearchInput.value.trim());
};

// =============================
// ALLIANCE → WARZONE PREVIEW
// =============================
const alliancePreviewInput =
  document.getElementById("alliancePreviewInput");
const alliancePreviewResults =
  document.getElementById("alliancePreviewResults");

alliancePreviewInput.oninput = () => {
  const q = alliancePreviewInput.value.trim().toLowerCase();
  alliancePreviewResults.innerHTML = "";

  if (q.length < 2) return;

  const map = {};

  allPlayers.forEach(p => {
    if (!p.alliance) return;
    const name = p.alliance.trim();

    if (!name.toLowerCase().includes(q)) return;

    map[name] = map[name] || new Set();
    map[name].add(p.warzone);
  });

  const entries = Object.entries(map);

  if (!entries.length) {
    alliancePreviewResults.textContent =
      "No alliance found in current data";
    return;
  }

  entries.forEach(([name, zones]) => {
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <strong>${name}</strong><br/>
      Warzones: ${[...zones].sort((a,b)=>a-b).join(", ")}
    `;
    alliancePreviewResults.appendChild(div);
  });
};

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const token = await user.getIdTokenResult(true);
      window.IS_ADMIN = token.claims.admin === true;
    } catch {
      window.IS_ADMIN = false;
    }
  } else {
    window.IS_ADMIN = false;
  }

  // 🔐 Load global app config (likesEnabled)
  await loadAppConfig();

  // 🛠️ STEP 6 — WIRE ADMIN TOGGLE
  const likesToggle = document.getElementById("likesToggle");

  if (likesToggle && window.IS_ADMIN) {
    likesToggle.checked = LIKES_ENABLED;

    likesToggle.onchange = async () => {
      try {
        const ref = doc(db, "app_config", "global");

        await updateDoc(ref, {
          likesEnabled: likesToggle.checked
        });

        alert("Likes setting updated. Refresh page to apply.");
      } catch (e) {
        console.error(e);
        alert("Failed to update likes setting");
      }
    };
  }

  // 🔁 Load players AFTER config + admin setup
  loadPlayers();
});

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    const ok = confirm("Logout from admin session?");
    if (!ok) return;

    try {
      await logout();
      window.location.href = "/admin-login.html";
    } catch (err) {
      alert("Logout failed");
      console.error(err);
    }
  };
}
const loadMoreBtn = document.getElementById("loadMoreBtn");

if (loadMoreBtn) {
  loadMoreBtn.onclick = () => {
    currentPage++;
    renderPagedPlayers(filteredPlayers);
  };
}
