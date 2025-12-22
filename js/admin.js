console.log("✅ admin.js loaded successfully");

import { db } from './firebase-config.js';
import { guardAdminPage, logout } from './auth.js';
import { renderCards } from './cards.js';
import {
  exportMembersToCSV as utilsExportCSV,
  parseCSV as utilsParseCSV,
  cleanNumber
} from './utils.js';
import { logAudit, subscribeAudit } from './audit.js';

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ==========================================================
   GLOBAL STATE
========================================================== */
const state = {
  members: [],
  filter: "RESET",
  search: "",
  sort: "none", // rank button NOT added, but sorting logic supports "rank"
  currentAdminName: ""
};

/* ==========================================================
   DOM SHORTCUT
========================================================== */
const $ = (id) => document.getElementById(id);

/* ==========================================================
   DOM ELEMENTS
========================================================== */
const dom = {
  btnLogout: $("btnLogout"),

  statTotal: $("statTotal"),
  statAvg: $("statAvg"),
  statMissing: $("statMissing"),

  filterButtons: Array.from(document.querySelectorAll(".filter-btn")),
  sortButtons: Array.from(document.querySelectorAll(".sort-btn")),

  searchInput: $("searchInput"),

  btnAdd: $("btnAddMember"),
  btnExport: $("btnExportCSV"),
  btnImport: $("btnImportCSV"),
  csvInput: $("csvFileInput"),

  grid: $("cardsGrid"),
  auditList: $("auditList"),

  modal: $("memberModal"),
  modalTitle: $("modalTitle"),

  fieldName: $("fieldName"),
  fieldRole: $("fieldRole"),

  fieldSquadPrimary: $("fieldSquadPrimary"),
  fieldSquadHybrid: $("fieldSquadHybrid"),
  hybridLabel: $("hybridLabel"),

  fieldPower: $("fieldPower"),
  fieldPowerType: $("fieldPowerType"),

  btnModalSave: $("btnModalSave"),
  btnModalCancel: $("btnModalCancel"),
};

let editingDocId = null;

/* ==========================================================
   BACKWARD COMPATIBILITY SQUAD PARSER
========================================================== */
function parseOldSquad(s) {
  s = String(s || "").toUpperCase();

  let primary = null;
  if (s.includes("TANK")) primary = "TANK";
  else if (s.includes("AIR")) primary = "AIR";
  else if (s.includes("MISSILE")) primary = "MISSILE";

  const hybrid = s.includes("HYBRID");
  return { primary, hybrid };
}

/* ==========================================================
   HELPERS
========================================================== */
function getMemberSquadLabel(m) {
  if (m.squadPrimary) {
    return m.squadHybrid ? `HYBRID (${m.squadPrimary})` : m.squadPrimary;
  }

  const p = parseOldSquad(m.squad);
  if (p.primary) return p.hybrid ? `HYBRID (${p.primary})` : p.primary;

  return m.squad || "—";
}

const isZeroPower = (v) => Number(v) === 0;

/* ==========================================================
   FILTER → SEARCH → SORT PIPELINE
   (Updated sorting logic)
========================================================== */
function filteredAndSortedMembers() {
  let arr = state.members.slice();

  /* -------------------------
        1) FILTERING
  ------------------------- */
  const f = state.filter.toUpperCase();
  if (f !== "RESET") {
    if (f === "MISSING_ZERO") {
      arr = arr.filter((m) => isZeroPower(m.power));
    } else if (f === "APPROX") {
      arr = arr.filter((m) => (m.powerType || "").toUpperCase() === "APPROX");
    } else if (f === "MISSING") {
      arr = arr.filter(
        (m) =>
          isZeroPower(m.power) ||
          (m.powerType || "").toUpperCase() === "APPROX"
      );
    } else {
      arr = arr.filter((m) =>
        ((m.role || "") + " " + getMemberSquadLabel(m))
          .toUpperCase()
          .includes(f)
      );
    }
  }

  /* -------------------------
        2) SEARCH
  ------------------------- */
  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter((m) =>
      (
        m.name +
        " " +
        m.role +
        " " +
        getMemberSquadLabel(m)
      )
        .toLowerCase()
        .includes(q)
    );
  }

  /* -------------------------
        3) SORTING — Updated to support rank mode
  ------------------------- */
  switch (state.sort) {
    case "rank":
      arr.sort((a, b) => Number(b.power) - Number(a.power));
      break;

    case "power-desc":
      arr.sort((a, b) => Number(b.power) - Number(a.power));
      break;

    case "power-asc":
      arr.sort((a, b) => Number(a.power) - Number(b.power));
      break;

    case "missing":
      arr.sort((a, b) => {
        const am =
          isZeroPower(a.power) || (a.powerType || "").toUpperCase() === "APPROX";
        const bm =
          isZeroPower(b.power) || (b.powerType || "").toUpperCase() === "APPROX";
        if (am !== bm) return bm - am;
        return Number(a.power) - Number(b.power);
      });
      break;

    case "name-asc":
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      break;

    case "name-desc":
      arr.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
      break;

    default:
      break;
  }

  return arr;
}

/* ==========================================================
   STATS
========================================================== */
function updateStats(view) {
  let total = view.length;
  let sum = 0;
  let missing = 0;

  view.forEach((m) => {
    sum += Number(m.power) || 0;

    if (
      isZeroPower(m.power) ||
      (m.powerType || "").toUpperCase() === "APPROX"
    ) {
      missing++;
    }
  });

  dom.statTotal.textContent = total;
  dom.statAvg.textContent = total ? (sum / total).toFixed(2) : "0.00";
  dom.statMissing.textContent = missing;
}

/* ==========================================================
   RENDER
========================================================== */
function render() {
  const view = filteredAndSortedMembers();
  renderCards(dom.grid, view, {
    showAdminActions: true,
    onEdit: openEditModal,
    onDelete: deleteMember
  });
  updateStats(view);
}

/* ==========================================================
   MODAL
========================================================== */
dom.btnModalCancel.addEventListener("click", () => {
  dom.modal.classList.add("hidden");
  editingDocId = null;
});

function openAddModal() {
  editingDocId = null;
  dom.modalTitle.textContent = "Add Member";

  dom.fieldName.value = "";
  dom.fieldRole.value = "";
  dom.fieldSquadPrimary.value = "TANK";
  dom.fieldSquadHybrid.checked = false;
  dom.hybridLabel.textContent = "No";
  dom.fieldPower.value = "";
  dom.fieldPowerType.value = "Precise";

  dom.modal.classList.remove("hidden");
}

function openEditModal(m) {
  editingDocId = m.id;
  dom.modalTitle.textContent = "Edit Member";

  dom.fieldName.value = m.name || "";
  dom.fieldRole.value = m.role || "";

  const parsed = parseOldSquad(m.squad);
  dom.fieldSquadPrimary.value = m.squadPrimary || parsed.primary || "TANK";
  dom.fieldSquadHybrid.checked = m.squadHybrid || parsed.hybrid || false;
  dom.hybridLabel.textContent = dom.fieldSquadHybrid.checked ? "Yes" : "No";

  dom.fieldPower.value = m.power ?? "";
  dom.fieldPowerType.value = m.powerType || "Precise";

  dom.modal.classList.remove("hidden");
}

/* ==========================================================
   SAVE MEMBER
========================================================== */
dom.btnModalSave.addEventListener("click", async () => {
  if (!dom.fieldName.value.trim()) {
    alert("Name required");
    return;
  }

  const primary = dom.fieldSquadPrimary.value;
  const hybrid = dom.fieldSquadHybrid.checked;

  const legacySquad = hybrid ? `${primary} HYBRID` : primary;

  const data = {
    name: dom.fieldName.value.trim(),
    role: dom.fieldRole.value.trim(),

    squadPrimary: primary,
    squadHybrid: hybrid,
    squad: legacySquad,

    power: cleanNumber(dom.fieldPower.value),
    powerType: dom.fieldPowerType.value,

    lastUpdated: serverTimestamp()
  };

  try {
    if (!editingDocId) {
      await addDoc(collection(db, "members"), data);
      await logAudit("ADD", data.name, "", state.currentAdminName);
    } else {
      await updateDoc(doc(db, "members", editingDocId), data);
      await logAudit("EDIT", data.name, "", state.currentAdminName);
    }
  } catch (err) {
    console.error(err);
    alert("Save failed");
  }

  dom.modal.classList.add("hidden");
});

/* ==========================================================
   DELETE MEMBER
========================================================== */
async function deleteMember(m) {
  if (!confirm(`Delete ${m.name}?`)) return;

  try {
    await deleteDoc(doc(db, "members", m.id));
    await logAudit("DELETE", m.name, "", state.currentAdminName);
  } catch (err) {
    console.error(err);
    alert("Delete failed");
  }
}

/* ==========================================================
   CSV EXPORT / IMPORT
========================================================== */
dom.btnExport.addEventListener("click", () =>
  utilsExportCSV(state.members)
);

dom.btnImport.addEventListener("click", () =>
  dom.csvInput.click()
);

dom.csvInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const imported = utilsParseCSV(ev.target.result);

    if (!confirm(`Replace with ${imported.length} rows?`)) return;

    // Delete existing
    for (const m of state.members) {
      await deleteDoc(doc(db, "members", m.id));
    }

    // Insert imported rows WITHOUT stars
    for (const m of imported) {
      const parsed = parseOldSquad(m.squad);
      const primary = parsed.primary || m.squadPrimary || "TANK";
      const hybrid = parsed.hybrid || !!m.squadHybrid || false;

      await addDoc(collection(db, "members"), {
        name: m.name,
        role: m.role,
        squadPrimary: primary,
        squadHybrid: hybrid,
        squad: hybrid ? `${primary} HYBRID` : primary,
        power: cleanNumber(m.power),
        powerType: m.powerType || "Precise",
        lastUpdated: serverTimestamp()
      });
    }

    alert("Import complete");
  };

  reader.readAsText(file);
});

/* ==========================================================
   SEARCH / FILTER / SORT EVENTS
========================================================== */
dom.searchInput.addEventListener("input", () => {
  state.search = dom.searchInput.value;
  render();
});

dom.filterButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter || "RESET";
    render();
  })
);

dom.sortButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    state.sort = btn.dataset.sort || "none";
    render();
  })
);

/* ==========================================================
   FIRESTORE LIVE SYNC
========================================================== */
function subscribeMembers() {
  const qRef = query(collection(db, "members"), orderBy("name"));
  onSnapshot(qRef, (snap) => {
    state.members = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    render();
  });
}

/* ==========================================================
   AUTH + INIT
========================================================== */
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  state.currentAdminName = user.email;

  subscribeMembers();
  subscribeAudit(dom.auditList);

  dom.btnLogout.addEventListener("click", async () => {
    await logout();
    window.location.href = "admin-login.html";
  });

  dom.btnAdd.addEventListener("click", openAddModal);
});
