export function calculatePTI({
  myPlayer,
  opponents,
  band
}) {
  const myFSP = myPlayer.effectiveFSP;

  const eligible = opponents.filter(o => {
    const diff = o.fsp - myFSP;
    if (band === "below") return diff < 0;
    if (band === "similar") return Math.abs(diff) <= 1_000_000;
    if (band === "above") return diff >= 1_000_000 && diff <= 3_000_000;
  });

  eligible.sort((a, b) => a.fsp - b.fsp);

  const enduranceFactor = getEnduranceFactor(myPlayer.tier);
  const avgTargetFSP =
    eligible.reduce((s, p) => s + p.fsp, 0) / (eligible.length || 1);

  let capacity = Math.floor(
    (myFSP * enduranceFactor) / avgTargetFSP
  );

  capacity = clampCapacity(capacity, myPlayer.tier);

  return {
    canHandle: eligible.slice(0, capacity),
    canStall: eligible.slice(capacity, capacity + 2),
    avoid: eligible.slice(capacity + 2)
  };
}

function getEnduranceFactor(tier) {
  return {
    whale: 1.35,
    mega: 1.25,
    frontline: 1.1,
    depth: 0.85,
    assumed: 0.9
  }[tier] || 1.0;
}

function clampCapacity(value, tier) {
  const max = {
    whale: 6,
    mega: 5,
    frontline: 3,
    depth: 1,
    assumed: 2
  }[tier] || 2;

  return Math.max(1, Math.min(value, max));
}
