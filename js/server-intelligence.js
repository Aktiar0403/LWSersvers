console.log("✅ Server Intelligence JS loaded");

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  query,
  where,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let editingPlayer = null;


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

// Always use this for power everywhere (Phase 4 helper)
function getEffectivePowerValue(p) {
  return computeEffectivePower(p).value;
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

let activeWarzone = "ALL";
let activeAlliance = "ALL";
let dominanceSelectedAlliance = null;


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

    console.log("✅ Loaded players:", allPlayers.length);

    // 🟢 Stage 3: Processing & building UI
    setProgress(70);

    // 🔥 RESET FILTERS AFTER LOAD
    activeWarzone = "ALL";
    activeAlliance = "ALL";

    // 🔥 REBUILD FILTER UI
    buildWarzoneCards();

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



/* =============================
   FILTERING
============================= */
function applyFilters() {
  filteredPlayers = [...allPlayers];

  // Search
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    filteredPlayers = filteredPlayers.filter(p =>
      p.name.toLowerCase().includes(q)
    );
  }

 // 🔑 WARZONE LOGIC
if (activeWarzone === "ALL") {
  // 🌍 LANDING: GLOBAL TOP 50 ONLY
  filteredPlayers.sort((a, b) =>
    getEffectivePowerValue(b) - getEffectivePowerValue(a)
  
  );

  filteredPlayers = filteredPlayers.slice(0, 100);

} else {
  // 🎯 WARZONE SELECTED
  filteredPlayers = filteredPlayers.filter(
    p => p.warzone === Number(activeWarzone)
  );

  // 🧬 ALLIANCE FILTER (only inside warzone)
  if (activeAlliance !== "ALL") {
    filteredPlayers = filteredPlayers.filter(
      p => p.alliance === activeAlliance
    );
  }

  // Rank inside warzone / alliance
  filteredPlayers.sort((a, b) =>
    getEffectivePowerValue(b) - getEffectivePowerValue(a)
  );
}



  renderTable(filteredPlayers);
  renderMobile(filteredPlayers);

 

  updatePowerSegments(filteredPlayers);
updateOverviewStats(allPlayers);
  const dominanceSection = document.getElementById("dominanceSection");

if (activeWarzone !== "ALL") {
  dominanceSection.style.display = "block";
  renderAllianceDominance(filteredPlayers);
} else {
  dominanceSection.style.display = "none";
  dominanceGrid.innerHTML = "";
}

}

/* =============================
   TABLE (FINAL – Phase 5.5 UI)
============================= */
function renderTable(players) {
  tableBody.innerHTML = "";

  players.forEach((p, index) => {
    const tr = document.createElement("tr");

    const powerData = computeEffectivePower(p);
    const effectivePower = powerData.value;
    const powerM = Math.round(effectivePower / 1_000_000);

    const statusIcon =
      powerData.tag === "confirmed" ? "✅" : "⚙️";

    const firstSquad = estimateFirstSquad(effectivePower);

    tr.innerHTML = `
      <!-- RANK -->
      <td class="col-rank desktop-only">${index + 1}</td>

      <!-- NAME + ALLIANCE META -->
      <td class="col-name desktop-only">
        <div class="name-main">${p.name}</div>
        <div class="name-meta muted">${p.alliance}</div>
      </td>

      <!-- WARZONE -->
      <td class="col-warzone desktop-only">
        ${p.warzone}
      </td>

      <!-- POWER + STATUS -->
      <td class="col-power desktop-only">
        <span class="power-main">${powerM}m</span>
        <span class="power-status ${powerData.tag}">
          ${statusIcon}
        </span>
      </td>

      <!-- SQUAD POWER -->
      <td class="col-squad desktop-only">
        ⚔️ ${firstSquad}
      </td>

      <!-- EDIT (DESKTOP ONLY – ADMIN LOGIC LATER) -->
      <td class="col-edit desktop-only">
        <button class="edit-btn" onclick="openEditPower('${p.id}')">✏️</button>
      </td>

      <!-- MOBILE CARD -->
    <td class="mobile-only mobile-cell">
  <div class="m-row">

    <!-- COL 1: RANK -->
    <div class="m-rank">
      ${index + 1}
    </div>

    <!-- COL 2: CENTER -->
    <div class="m-center">
      <div class="m-name">${p.name}</div>
      <div class="m-meta">${p.warzone} • ${p.alliance}</div>
    </div>

    <!-- COL 3: RIGHT -->
    <div class="m-right">
      <div class="m-power">${powerM}m</div>
      <div class="m-sub">
        <span class="m-squad">⚔️ ${firstSquad}</span>
        <span
          class="m-status ${powerData.tag}"
          title="${powerData.tag === "confirmed" ? "Confirmed power" : "Estimated power"}"
        >
          ${powerData.tag === "confirmed" ? "✔" : "≈"}
        </span>
      </div>
    </div>

  </div>
</td>



    `;

    tableBody.appendChild(tr);
  });
}

function renderMobile(players) {
  const list = document.getElementById("mobileList");
  if (!list) return;

  list.innerHTML = "";

  players.forEach((p, index) => {
    const powerData = computeEffectivePower(p);
    const powerM = Math.round(powerData.value / 1_000_000);
    const firstSquad = estimateFirstSquad(powerData.value);

    const card = document.createElement("div");
    card.className = "mobile-card";

    card.innerHTML = `
      <div class="m-row-1">
        <span class="m-rank">${index + 1}</span>
        <span class="m-name">${p.name}</span>
        <span class="m-power">${powerM}m</span>
      </div>

      <div class="m-row-2">
        ${p.warzone} • ${p.alliance}
      </div>

      <div class="m-row-3">
        ⚔️ ${firstSquad}
        <span class="m-status ${powerData.tag}">
          ${powerData.tag === "confirmed" ? "✔" : "⚙️"}
        </span>
      </div>
    `;

    list.appendChild(card);
  });
}




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
  loadPlayers();
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
          loadPlayers();

    } catch (err) {
      console.error("Excel import failed:", err);
      alert("Excel import failed. Check console.");
    }
  };

  reader.readAsArrayBuffer(file);
};
async function deleteByUploadId(uploadId) {
  if (!uploadId) return;

  const confirmText = prompt(
    `⚠️ This will permanently delete all players from upload:\n\n${uploadId}\n\nType: DELETE ${uploadId}`
  );

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
  loadPlayers(); // refresh UI
}
window.deleteByUploadId = deleteByUploadId;

/* =============================
   SEARCH
============================= */
searchInput.oninput = applyFilters;

/* =============================
   INIT
============================= */




loadPlayers();
function updateOverviewStats(players) {
  const totalPlayers = players.length;

  const warzones = new Set(players.map(p => p.warzone));
  const alliances = new Set(players.map(p => p.alliance));

  document.getElementById("totalPlayers").textContent = totalPlayers;
  document.getElementById("totalWarzones").textContent = warzones.size;
  document.getElementById("totalAlliances").textContent = alliances.size;
}
function openEditPower(playerId) {
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

    // 🔁 Update local cache (IMPORTANT)
    editingPlayer.totalPower = newPower;
    editingPlayer.basePower = newPower;
    editingPlayer.powerSource = "confirmed";
    editingPlayer.lastConfirmedAt = new Date();

    closeEditPowerModal();
    applyFilters(); // re-render table

    alert("✅ Power updated successfully");

  } catch (err) {
    console.error("Power update failed:", err);
    alert("❌ Failed to update power. Check console.");
  }
};
