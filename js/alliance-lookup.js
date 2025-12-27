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
    result.textContent = "Type an alliance name to find its warzone";
    result.className = "al-result muted";
    return;
  }

  const exact = ALLIANCES.find(a => a.alliance === q);
  const casingMatch = ALLIANCES.find(
    a => a.alliance.toLowerCase() === q.toLowerCase() && a.alliance !== q
  );

  if (exact) {
    result.innerHTML = `<strong>${exact.alliance}</strong> → WZ ${exact.warzone}`;
    result.className = "al-result found";
    result.onclick = () => openModal(exact);
  } else if (casingMatch) {
    result.textContent =
      `⚠ Found "${casingMatch.alliance}" in WZ ${casingMatch.warzone} (case-sensitive)`;
    result.className = "al-result warn";
  } else {
    result.textContent = "No exact match found";
    result.className = "al-result muted";
  }
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
