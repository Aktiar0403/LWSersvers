const fs = require("fs");

// 🔁 CHANGE THIS if needed
const CSV_FILE = "alliance_reference.csv";
const OUTPUT_FILE = "alliance_index.json";

const raw = fs.readFileSync(CSV_FILE, "utf8");
const rows = raw.split(/\r?\n/);

const result = [];

rows.forEach((row, rowIndex) => {
  if (!row.trim()) return;

  const cols = row.split(",");

  // ❌ skip closed server rows
  if (cols[0]?.toLowerCase().includes("closed")) return;

  // ✅ last column = date
  const date = cols[cols.length - 1]?.trim();

  // ⚠️ WARZONE NUMBER
  // 👉 If warzone is NOT in Excel, set it manually here
  const warzone = extractWarzoneFromRow(cols, rowIndex);

  // 👉 top 10 alliance columns
  cols.slice(0, cols.length - 1).forEach(tag => {
    tag = tag?.trim();
    if (!tag) return;

    result.push({
      tag,
      warzone,
      date
    });
  });
});

fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(result, null, 2)
);

console.log("✅ JSON generated:", result.length);

// =============================
// HELPERS
// =============================

// ⚠️ MODIFY THIS if needed
function extractWarzoneFromRow(cols, index) {
  // OPTION 1: warzone is first column
  if (!isNaN(cols[0])) return Number(cols[0]);

  // OPTION 2: warzone is implicit (row order)
  // return 80 + index;

  throw new Error("Warzone not detected for row " + index);
}
