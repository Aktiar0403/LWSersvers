document.addEventListener("DOMContentLoaded", () => {

  console.log("✅ Alliance lookup initializing…");

  /* ======================================================
     CONFIG
  ====================================================== */
  const DATA_URL = "/data/alliance_lookup.json";

  /* ======================================================
     STATE
  ====================================================== */
  let ALLIANCES = [];

  /* ======================================================
     DOM
  ====================================================== */
  const input = document.getElementById("allianceLookupInput");
  const resultBox = document.getElementById("allianceLookupResult");

  const modal = document.getElementById("allianceDiscordModal");
  const modalAlliance = document.getElementById("modalAllianceName");
  const modalWarzone = document.getElementById("modalWarzone");
  const modalUpdated = document.getElementById("modalUpdated");
  const modalCloseBtn = document.querySelector(".discord-modal-close");

  if (!input || !resultBox) {
    console.warn("⚠ Alliance lookup not present on this page");
    return;
  }

  /* ======================================================
     LOAD JSON
  ====================================================== */
  fetch(DATA_URL)
    .then(r => r.json())
    .then(data => {
      ALLIANCES = data;
      console.log("✅ Alliance lookup ready:", ALLIANCES.length);
    })
    .catch(err => {
      console.error("❌ Failed to load alliance_lookup.json", err);
    });

  /* ======================================================
     HELPERS
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

  function findAlliance(query) {
    const q = query.trim();
    if (!q) return { type: "empty" };

    const exact = ALLIANCES.find(a => a.alliance === q);
    if (exact) return { type: "exact", entry: exact };

    const casingMatches = ALLIANCES.filter(
      a => a.alliance.toLowerCase() === q.toLowerCase()
    );

    if (casingMatches.length > 0) {
      return {
        type: "case-warning",
        matches: casingMatches.map(a => a.alliance)
      };
    }

    return { type: "not-found" };
  }

  /* ======================================================
     MODAL
  ====================================================== */
  function openModal(entry) {
    if (!modal) return;

    if (modalAlliance) modalAlliance.textContent = entry.alliance;
    if (modalWarzone) modalWarzone.textContent = entry.warzone;
    if (modalUpdated) modalUpdated.textContent = formatUpdated(entry);

    modal.classList.remove("hidden");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
  }

  /* ======================================================
     INPUT HANDLER (NOW WORKS)
  ====================================================== */
  input.addEventListener("input", () => {
    const result = findAlliance(input.value);

    if (result.type === "empty") {
      resultBox.innerHTML = `
        
        <div class="al-credit">
         Type Alliace Name
        </div>
      `;
      resultBox.className = "al-result muted";
      return;
    }

    if (result.type === "exact") {
      const e = result.entry;

     resultBox.innerHTML = `
  <div class="al-row-compact">
    <span class="al-status ok">✔</span>

    <span class="al-main">
      <strong>${e.alliance}</strong>
      <span class="al-arrow">→</span>
      <span class="al-wz">WZ ${e.warzone}</span>
    </span>

    <img
      src="https://cdn-icons-png.flaticon.com/512/2111/2111370.png"
      class="al-discord-icon"
      data-open-modal
    />

    <button class="al-btn" data-open-modal>
      Coordinate
    </button>
  </div>
`;


      resultBox.className = "al-result found";

      resultBox
        .querySelectorAll("[data-open-modal]")
        .forEach(el =>
          el.addEventListener("click", () => openModal(e))
        );

      return;
    }

    if (result.type === "case-warning") {
      resultBox.innerHTML = `
        <div class="al-row-compact">
          <span class="al-status warn">⚠</span>
          <span class="al-main">
            Valid
          </span>
        </div>
        <div class="al-warning-text">
    
          ${result.matches.map(n => `<strong>${n}</strong>`).join(", ")}
        </div>
      `;
      resultBox.className = "al-result warn";
      return;
    }

    resultBox.textContent = "No exact alliance found";
    resultBox.className = "al-result muted";
  });

  /* ======================================================
     MODAL CLOSE
  ====================================================== */
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

});
