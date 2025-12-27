/* =====================================================
   Alliance → Warzone Lookup (Standalone)
   Exact match only + proper date + casing warning
   ===================================================== */

let ALLIANCE_INDEX = new Map();          // exact-case index
let ALLIANCE_CASE_MAP = new Map();       // lowercase → Set of casings

/* -----------------------------
   Load JSON once
----------------------------- */
fetch("/data/alliance_lookup.json")
  .then(res => res.json())
  .then(data => {
    buildAllianceIndexes(data);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance lookup JSON", err);
  });

/* -----------------------------
   Excel date → YYYY-MM-DD
----------------------------- */
function formatDate(value) {
  if (typeof value === "string") return value;

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(
      excelEpoch.getTime() + value * 86400000
    );
    return date.toISOString().slice(0, 10);
  }

  return "—";
}

/* -----------------------------
   Build indexes
----------------------------- */
function buildAllianceIndexes(data) {
  ALLIANCE_INDEX.clear();
  ALLIANCE_CASE_MAP.clear();

  data.forEach(item => {
    if (!item || !item.alliance || !item.warzone) return;

    const allianceName = String(item.alliance).trim();
    const lower = allianceName.toLowerCase();

    // 🔹 Exact-case index
    if (!ALLIANCE_INDEX.has(allianceName)) {
      ALLIANCE_INDEX.set(allianceName, {
        name: allianceName,
        entries: []
      });
    }

    ALLIANCE_INDEX.get(allianceName).entries.push({
      warzone: Number(item.warzone),
      updatedAt: formatDate(item.updatedAt)
    });

    // 🔹 Case-variant tracker
    if (!ALLIANCE_CASE_MAP.has(lower)) {
      ALLIANCE_CASE_MAP.set(lower, new Set());
    }
    ALLIANCE_CASE_MAP.get(lower).add(allianceName);
  });

  console.log("✅ Alliance lookup ready:", ALLIANCE_INDEX.size);
}

/* -----------------------------
   Exact match only
----------------------------- */
function findAllianceExact(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  return ALLIANCE_INDEX.get(q) || null;
}

/* -----------------------------
   UI wiring
----------------------------- */
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
    const casingVariants =
      ALLIANCE_CASE_MAP.get(name.toLowerCase()) || new Set();

    const otherCasings = [...casingVariants].filter(
      v => v !== name
    );

    const casingWarning = otherCasings.length
      ? `<br><small style="color:#ffb84d">
           ⚠️ Similar alliance exists with different casing:
           ${otherCasings.join(", ")}
         </small>`
      : "";

    resultBox.innerHTML = `
  <div class="al-row">
    <span class="al-main">
      <strong>${name}</strong> → ${warzones.join(", ")}
    </span>

    <span
      class="al-discord"
      title="Coordinate on Discord"
      onclick="openAllianceDiscord('${name}')"
    >
      <img src="/assets/discord.svg" alt="Discord" />
    </span>
  </div>

  <div class="al-date">
    Updated: ${latestUpdate || "—"}
  </div>
`;

  });
}
