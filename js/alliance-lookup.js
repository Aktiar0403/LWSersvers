/* =====================================================
   Alliance → Warzone Lookup (Standalone)
   Exact match only + proper date formatting
   ===================================================== */

let ALLIANCE_INDEX = new Map();

/* -----------------------------
   Load JSON once
----------------------------- */
fetch("/data/alliance_lookup.json")
  .then(res => res.json())
  .then(data => {
    buildAllianceIndex(data);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance lookup JSON", err);
  });

/* -----------------------------
   Date normalization
   (Excel serial → YYYY-MM-DD)
----------------------------- */
function formatDate(value) {
  // Already formatted string
  if (typeof value === "string") {
    return value;
  }

  // Excel serial number
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
   Build index
----------------------------- */
function buildAllianceIndex(data) {
  ALLIANCE_INDEX.clear();

  data.forEach(item => {
    if (!item || !item.alliance || !item.warzone) return;

    const key = String(item.alliance).trim();


    if (!ALLIANCE_INDEX.has(key)) {
      ALLIANCE_INDEX.set(key, []);
    }

    ALLIANCE_INDEX.get(key).push({
      warzone: Number(item.warzone),
      updatedAt: formatDate(item.updatedAt)
    });
  });

  console.log("✅ Alliance lookup ready:", ALLIANCE_INDEX.size);
}

/* -----------------------------
   Exact match search ONLY
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

    const entries = findAllianceExact(raw);

    if (!entries) {
      resultBox.textContent =
        "No warzone found for this alliance";
      resultBox.className = "al-result muted";
      return;
    }

    const warzones = [
      ...new Set(entries.map(e => e.warzone))
    ].sort((a, b) => a - b);

    // latest updatedAt across all warzones
    const latestUpdate = entries
      .map(e => e.updatedAt)
      .filter(d => d && d !== "—")
      .sort()
      .pop();

    resultBox.innerHTML = `
      <strong>${raw.toUpperCase()}</strong> found in:
      <br>Warzone${warzones.length > 1 ? "s" : ""} ${warzones.join(", ")}
      <br><small>Last updated: ${latestUpdate || "—"}</small>
    `;
    resultBox.className = "al-result";
  });
}
