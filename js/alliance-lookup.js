console.log("✅ Alliance lookup loading...");

/* =========================
   STATE
========================= */
let ALLIANCES = [];

/* =========================
   DOM
========================= */
const input = document.getElementById("allianceLookupInput");
const result = document.getElementById("allianceLookupResult");

const modal = document.getElementById("allianceDiscordModal");
const modalAlliance = document.getElementById("modalAllianceName");
const modalWarzone = document.getElementById("modalWarzone");
const modalUpdated = document.getElementById("modalUpdated");
const closeBtn = document.querySelector(".discord-modal-close");

/* =========================
   LOAD JSON
========================= */
fetch("/data/alliance_lookup.json")
  .then(r => r.json())
  .then(data => {
    ALLIANCES = data;
    console.log("✅ Alliance lookup ready:", data.length);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance_lookup.json", err);
  });

/* =========================
   HELPERS
========================= */
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

function openModal(entry) {
  modalAlliance.textContent = entry.alliance;
  modalWarzone.textContent = entry.warzone;
  modalUpdated.textContent = formatUpdated(entry);

  modal.classList.remove("hidden");
}

/* =========================
   SEARCH INPUT
========================= */
input.addEventListener("input", () => {
  const q = input.value.trim();

  // 🔹 IDLE STATE
  if (!q) {
    result.innerHTML = `
      <div class="al-muted">
        Search an alliance name to find its warzone
      </div>
      <div class="al-credit">
        Data provided by <strong>Coordinates List Discord</strong>
      </div>
    `;
    result.className = "al-result muted";
    return;
  }

  // 🔍 EXACT MATCH (case-sensitive)
  const exact = ALLIANCES.find(a => a.alliance === q);

  // ⚠️ CASE-INSENSITIVE MATCH
  const casing = ALLIANCES.find(
    a => a.alliance.toLowerCase() === q.toLowerCase() &&
         a.alliance !== q
  );

  /* =========================
     EXACT MATCH FOUND
  ========================= */
  if (exact) {
    result.innerHTML = `
      <div class="al-row-compact" data-open-modal>

        <span class="al-status ok">✔</span>

        <span class="al-main">
          <strong>${exact.alliance}</strong>
          <span class="al-arrow">→</span>
          <span class="al-wz">WZ ${exact.warzone}</span>
        </span>

        <img
          src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
          class="al-discord-icon"
          title="Open coordinates"
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

    // Attach modal open to all clickable elements
    result.querySelectorAll("[data-open-modal]").forEach(el => {
      el.addEventListener("click", () => openModal(exact));
    });

    result.className = "al-result found";
    return;
  }

  /* =========================
     CASING WARNING
  ========================= */
  if (casing) {
    result.innerHTML = `
      <div class="al-row-compact">

        <span class="al-status warn">⚠</span>

        <span class="al-main">
          <strong>${casing.alliance}</strong>
          <span class="al-arrow">→</span>
          <span class="al-wz">WZ ${casing.warzone}</span>
        </span>

        <span class="al-warning-text">
          case-sensitive
        </span>

      </div>
    `;

    result.className = "al-result warn";
    return;
  }

  /* =========================
     NO MATCH
  ========================= */
  result.textContent = "No exact alliance found";
  result.className = "al-result muted";
});

/* =========================
   MODAL CLOSE HANDLERS
========================= */
closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.classList.add("hidden");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    modal.classList.add("hidden");
  }
});
