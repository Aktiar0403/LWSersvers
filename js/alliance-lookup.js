/* =====================================================
   Alliance → Warzone Lookup (Standalone)
   ===================================================== */

let ALLIANCE_LOOKUP = [];
let ALLIANCE_INDEX = new Map();

/* -----------------------------
   Load JSON once
----------------------------- */
fetch("/data/alliance_lookup.json")
  .then(res => res.json())
  .then(data => {
    ALLIANCE_LOOKUP = data;
    buildAllianceIndex(data);
  })
  .catch(err => {
    console.error("❌ Failed to load alliance lookup JSON", err);
  });

/* -----------------------------
   Build fast index
----------------------------- */
function buildAllianceIndex(data) {
  ALLIANCE_INDEX.clear();

  data.forEach(item => {
    const key = normalize(item.alliance);

    if (!ALLIANCE_INDEX.has(key)) {
      ALLIANCE_INDEX.set(key, []);
    }

    ALLIANCE_INDEX.get(key).push({
      warzone: item.warzone,
      updatedAt: item.updatedAt
    });
  });

  console.log("✅ Alliance lookup index ready:", ALLIANCE_INDEX.size);
}

/* -----------------------------
   Helpers
----------------------------- */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .trim();
}

/* -----------------------------
   Search Logic
----------------------------- */
function findAlliance(query) {
  const q = normalize(query);
  if (!q) return null;

  // 1️⃣ Exact match
  if (ALLIANCE_INDEX.has(q)) {
    return {
      type: "exact",
      alliance: query,
      entries: ALLIANCE_INDEX.get(q)
    };
  }

  // 2️⃣ Partial match
  const matches = [];

  for (const [key, entries] of ALLIANCE_INDEX.entries()) {
    if (key.includes(q)) {
      matches.push({
        alliance: key,
        entries
      });
    }
  }

  if (matches.length) {
    return {
      type: "partial",
      matches
    };
  }

  return null;
}

/* -----------------------------
   UI Wiring
----------------------------- */
const input = document.getElementById("allianceLookupInput");
const resultBox = document.getElementById("allianceLookupResult");

if (input && resultBox) {
  input.addEventListener("input", () => {
    const value = input.value.trim();

    if (!value) {
      resultBox.textContent =
        "Type an alliance name to find its warzone";
      resultBox.className = "al-result muted";
      return;
    }

    const res = findAlliance(value);

    if (!res) {
      resultBox.textContent = "No warzone found for this alliance";
      resultBox.className = "al-result muted";
      return;
    }

    // ✅ EXACT MATCH
    if (res.type === "exact") {
      const warzones = [
        ...new Set(res.entries.map(e => e.warzone))
      ].sort((a, b) => a - b);

      const updatedAt = res.entries[0].updatedAt;

      resultBox.innerHTML = `
        <strong>${value}</strong> found in:
        <br>Warzone${warzones.length > 1 ? "s" : ""} ${warzones.join(", ")}
        <br><small>Updated: ${updatedAt}</small>
      `;
      resultBox.className = "al-result";
      return;
    }

    // ⚠️ PARTIAL MATCH
    if (res.type === "partial") {
      const list = res.matches
        .slice(0, 5)
        .map(m => {
          const wzs = [
            ...new Set(m.entries.map(e => e.warzone))
          ].join(", ");
          return `${m.alliance.toUpperCase()} → ${wzs}`;
        })
        .join("<br>");

      resultBox.innerHTML = `
        Possible matches:
        <br>${list}
      `;
      resultBox.className = "al-result";
    }
  });
}
