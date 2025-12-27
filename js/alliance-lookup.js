console.log("✅ Alliance lookup ready");

let ALLIANCES = [];

// Load JSON
fetch("/data/alliance_lookup.json")
  .then(r => r.json())
  .then(data => {
    ALLIANCES = data;
    console.log("✅ Alliance lookup ready:", data.length);
  });

const input = document.getElementById("allianceLookupInput");
const result = document.getElementById("allianceLookupResult");

const modal = document.getElementById("allianceDiscordModal");
const modalAlliance = document.getElementById("modalAllianceName");
const modalWarzone = document.getElementById("modalWarzone");
const modalUpdated = document.getElementById("modalUpdated");

input.addEventListener("input", () => {
  const q = input.value.trim();

  if (!q) {
    result.innerHTML = `
      <div class="al-muted">
        Alliance reference data provided by
        <strong>Coordinates List Discord</strong>
      </div>
    `;
    result.className = "al-result muted";
    return;
  }

  const exact = ALLIANCES.find(a => a.alliance === q);
  const casing = ALLIANCES.find(
    a => a.alliance.toLowerCase() === q.toLowerCase() &&
         a.alliance !== q
  );

  // ✅ EXACT MATCH
  if (exact) {
    result.innerHTML = `
      <div class="al-row-compact">
        <span class="al-status ok">✔</span>

        <span class="al-main">
          <strong>${exact.alliance}</strong>
          <span class="al-arrow">→</span>
          <span class="al-wz">WZ ${exact.warzone}</span>
        </span>

        <img
          src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
          class="al-discord-icon"
          title="Coordinates Discord"
        />

        <button
          class="al-btn"
          onclick="openModal(${JSON.stringify(exact)})"
        >
          Coordinate
        </button>
      </div>

      <div class="al-credit">
        Data provided by Coordinates List Discord
      </div>
    `;
    result.className = "al-result found";
    return;
  }

  // ⚠️ CASING WARNING
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

  result.textContent = "No exact alliance found";
  result.className = "al-result muted";
});


function openModal(entry) {
  modalAlliance.textContent = entry.alliance;
  modalWarzone.textContent = entry.warzone;
  modalUpdated.textContent = new Date(entry.updated).toLocaleDateString();
  modal.classList.remove("hidden");
}

// Close modal
modal.addEventListener("click", e => {
  if (e.target === modal) modal.classList.add("hidden");
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") modal.classList.add("hidden");
});

document.querySelector(".discord-modal-close")
  .addEventListener("click", () => modal.classList.add("hidden"));
