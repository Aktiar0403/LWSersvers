console.log("✅ Alliance lookup loading…");

/* ======================================================
   CONFIG
====================================================== */
const DATA_URL = "/data/alliance_lookup.json";

/* ======================================================
   STATE
====================================================== */
let ALLIANCES = [];

/* ======================================================
   DOM REFERENCES
====================================================== */
const input = document.getElementById("allianceLookupInput");
const resultBox = document.getElementById("allianceLookupResult");

/* Modal */
const modal = document.getElementById("allianceDiscordModal");
const modalAlliance = document.getElementById("modalAllianceName");
const modalWarzone = document.getElementById("modalWarzone");
const modalUpdated = document.getElementById("modalUpdated");
const modalCloseBtn = document.querySelector(".discord-modal-close");

/* ======================================================
   LOAD JSON DATA
====================================================== */
fetch(DATA_URL)
  .then(res => res.json())
  .then(data => {
    ALLIANCES = data;
    console.log("✅ Alliance lookup ready:", ALLIANCES.length);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance_lookup.json", err);
  });

/* ======================================================
   DATE FORMATTER (SAFE)
====================================================== */
function formatUpdated(entry) {
  const raw =
    entry.updated ||
    entry.updateDate ||
    entry.updatedAt ||
    null;

  if (!raw) return "Unknown";

  const d = new Date(raw);
  if (isNaN(d)) return "Unknown";

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/* ======================================================
   CORE SEARCH LOGIC (CRITICAL)
====================================================== */
function findAlliance(query) {
  const q = query.trim();
  if (!q) return { type: "empty" };

  /* 1️⃣ Exact case-sensitive match */
  const exact = ALLIANCES.find(a => a.alliance === q);
  if (exact) {
    return { type: "exact", entry: exact };
  }

  /* 2️⃣ Same letters, different casing */
  const casingMatches = ALLIANCES.filter(
    a => a.alliance.toLowerCase() === q.toLowerCase()
  );

  if (casingMatches.length > 0) {
    return {
      type: "case-warning",
      matches: casingMatches.map(a => a.alliance)
    };
  }

  /* 3️⃣ Nothing found */
  return { type: "not-found" };
}

/* ======================================================
   MODAL CONTROL
====================================================== */
function openModal(entry) {
  modalAlliance.textContent = entry.alliance;
  modalWarzone.textContent = entry.warzone;
  modalUpdated.textContent = formatUpdated(entry);
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

/* ======================================================
   INPUT HANDLER
====================================================== */
input.addEventListener("input", () => {
  const query = input.value;
  const result = findAlliance(query);

  /* ===== EMPTY ===== */
  if (result.type === "empty") {
    resultBox.innerHTML = `
      <div class="al-muted">
        Search an alliance name to find its warzone
      </div>
      <div class="al-credit">
        Data provided by <strong>Coordinates List Discord</strong>
      </div>
    `;
    resultBox.className = "al-result muted";
    return;
  }

  /* ===== EXACT MATCH ===== */
  if (result.type === "exact") {
    const entry = result.entry;

    resultBox.innerHTML = `
      <div class="al-row-compact">

        <span class="al-status ok">✔</span>

        <span class="al-main">
          <strong>${entry.alliance}</strong>
          <span class="al-arrow">→</span>
          <span class="al-wz">WZ ${entry.warzone}</span>
        </span>

        <img
          src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
          class="al-discord-icon"
          title="Coordinate on Discord"
          data-open-modal
        />

        <button class="al-btn" data-open-modal>
          Coordinate
        </button>

      </div>

      <div class="al-credit">
        Data provided by Coordinates List Discord
      </div>
    `;

    resultBox.className = "al-result found";

    /* Open modal on icon or button */
    resultBox
      .querySelectorAll("[data-open-modal]")
      .forEach(el => {
        el.addEventListener("click", () => openModal(entry));
      });

    return;
  }

  /* ===== CASE-SENSITIVITY WARNING ===== */
  if (result.type === "case-warning") {
    resultBox.innerHTML = `
      <div class="al-row-compact">

        <span class="al-status warn">⚠</span>

        <span class="al-main">
          Alliance exists with different casing
        </span>

      </div>

      <div class="al-warning-text">
        Valid names:
        ${result.matches.map(n => `<strong>${n}</strong>`).join(", ")}
      </div>
    `;

    resultBox.className = "al-result warn";
    return;
  }

  /* ===== NOT FOUND ===== */
  resultBox.textContent = "No exact alliance found";
  resultBox.className = "al-result muted";
});

/* ======================================================
   MODAL CLOSE EVENTS
====================================================== */
modalCloseBtn.addEventListener("click", closeModal);

modal.addEventListener("click", e => {
  if (e.target === modal) closeModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});
