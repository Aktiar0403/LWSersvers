/* =====================================================
   Alliance → Warzone Lookup (FINAL)
   ===================================================== */

/* =============================
   STATE
============================= */

let ALLIANCE_INDEX = new Map();     // exact-case index
let ALLIANCE_CASE_MAP = new Map();  // lowercase → Set(casings)

/* =============================
   LOAD JSON
============================= */

fetch("/data/alliance_lookup.json")
  .then(res => res.json())
  .then(data => {
    buildAllianceIndexes(data);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance lookup JSON", err);
  });

/* =============================
   DATE NORMALIZATION
============================= */

function formatDate(value) {
  if (typeof value === "string") return value;

  // Excel serial number → date
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(
      excelEpoch.getTime() + value * 86400000
    );
    return date.toISOString().slice(0, 10);
  }

  return "—";
}

/* =============================
   BUILD INDEXES
============================= */

function buildAllianceIndexes(data) {
  ALLIANCE_INDEX.clear();
  ALLIANCE_CASE_MAP.clear();

  data.forEach(item => {
    if (!item || !item.alliance || !item.warzone) return;

    const alliance = String(item.alliance).trim();
    const lower = alliance.toLowerCase();

    // Exact-case index
    if (!ALLIANCE_INDEX.has(alliance)) {
      ALLIANCE_INDEX.set(alliance, {
        name: alliance,
        entries: []
      });
    }

    ALLIANCE_INDEX.get(alliance).entries.push({
      warzone: Number(item.warzone),
      updatedAt: formatDate(item.updatedAt)
    });

    // Case collision tracker
    if (!ALLIANCE_CASE_MAP.has(lower)) {
      ALLIANCE_CASE_MAP.set(lower, new Set());
    }
    ALLIANCE_CASE_MAP.get(lower).add(alliance);
  });

  console.log("✅ Alliance lookup ready:", ALLIANCE_INDEX.size);
}

/* =============================
   EXACT MATCH ONLY
============================= */

function findAllianceExact(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  return ALLIANCE_INDEX.get(q) || null;
}

/* =============================
   RESULT UI
============================= */

const input = document.getElementById("allianceLookupInput");
const resultBox = document.getElementById("allianceLookupResult");

if (input && resultBox) {
  input.addEventListener("input", () => {
    const raw = input.value.trim();

    if (!raw) {
      resultBox.textContent =
        "Type an alliance name to find its warzone";
      resultBox.className = "al-result muted";
      return;
    }

    const result = findAllianceExact(raw);

    if (!result) {
      resultBox.textContent =
        "No warzone found for this alliance";
      resultBox.className = "al-result muted";
      return;
    }

    const { name, entries } = result;

    const warzones = [
      ...new Set(entries.map(e => e.warzone))
    ].sort((a, b) => a - b);

    const latestUpdate = entries
      .map(e => e.updatedAt)
      .filter(d => d && d !== "—")
      .sort()
      .pop();

    // ⚠️ casing warning
    const variants =
      ALLIANCE_CASE_MAP.get(name.toLowerCase()) || new Set();

    const otherCasings = [...variants].filter(v => v !== name);

    const casingWarning = otherCasings.length
      ? `<div class="al-warning">
           ⚠️ Similar alliance exists with different casing:
           ${otherCasings.join(", ")}
         </div>`
      : "";

    resultBox.innerHTML = `
      <div class="al-row">
        <span class="al-main">
          <strong>${name}</strong> → ${warzones.join(", ")}
        </span>

        <span
          class="al-discord"
          title="Request coordinates on Discord"
          onclick="openAllianceDiscord('${name}', '${warzones.join(", ")}')"
        >
          <img src="/assets/discord.svg" alt="Discord" />
        </span>
      </div>

      <div class="al-date">
        Updated: ${latestUpdate || "—"}
      </div>

      ${casingWarning}
    `;
    resultBox.className = "al-result";
  });
}

/* =============================
   DISCORD MODAL
============================= */

function openAllianceDiscord(alliance, warzone) {
  const modal = document.getElementById("allianceDiscordModal");
  if (!modal) return;

  const nameEl = document.getElementById("modalAllianceName");
  const wzEl = document.getElementById("modalWarzone");
  const linkEl = document.getElementById("discordLink");

  if (nameEl) nameEl.textContent = alliance;
  if (wzEl) wzEl.textContent = warzone;

  // 🔧 replace with real invite
  if (linkEl) {
    linkEl.href = "https://discord.gg/YOUR_INVITE_CODE";
  }

  modal.classList.remove("hidden");
}

function closeAllianceDiscord() {
  const modal = document.getElementById("allianceDiscordModal");
  if (modal) modal.classList.add("hidden");
}

/* =============================
   MODAL EVENT HANDLERS
============================= */

document.addEventListener("DOMContentLoaded", () => {

  // Close button
  const closeBtn =
    document.querySelector(".discord-modal-close");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeAllianceDiscord);
  }

  // Outside click
  const overlay =
    document.getElementById("allianceDiscordModal");

  if (overlay) {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) {
        closeAllianceDiscord();
      }
    });
  }
});

// ESC key close
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeAllianceDiscord();
  }
});
