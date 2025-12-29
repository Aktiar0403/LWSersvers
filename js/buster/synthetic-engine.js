export function buildSyntheticCommanders({
  listedPlayers,
  totalSlots = 100,
  referencePower
}) {
  const count = totalSlots - listedPlayers.length;
  if (count <= 0) return [];

  const fsp = estimateFirstSquadPower(referencePower);

  return Array.from({ length: count }).map(() => ({
    name: "Unlisted Commander",
    power: referencePower,
    fsp,
    tier: "assumed",
    isSynthetic: true,
    isPresent: true
  }));
}

/* ACIS function – imported in real code */
function estimateFirstSquadPower(effectivePower) {
  if (effectivePower <= 150e6) return effectivePower * 0.37;
  if (effectivePower <= 220e6) return effectivePower * 0.34;
  if (effectivePower <= 320e6) return effectivePower * 0.30;
  return effectivePower * 0.27;
}
