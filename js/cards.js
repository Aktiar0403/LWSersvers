// cards.js (updated — rank badge, medals, power above icon, names fixed)

const styleTag = document.createElement("style");
styleTag.innerHTML = `
@keyframes glossMove {
  0% { top:-160%; left:-160%; }
  100% { top:160%; left:160%; }
}

@keyframes medalPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
`;
document.head.appendChild(styleTag);

const GOLD = {
  neon: "rgba(255, 210, 60, 1)",
  neonLight: "rgba(255, 210, 60, 0.85)",
  border: "rgba(255, 210, 60, 1)"
};

function squadPillProps(primary, hybrid) {
  const base = {
    TANK: {
      icon: "/assets/squad-icons/tank.png",
      neon: "rgba(10,102,255,0.85)",
      neonLight: "rgba(10,102,255,0.45)",
      border: "rgba(10,102,255,0.25)",
      bg: "rgba(10,102,255,0.12)",
      fg: "rgba(10,102,255,0.95)"
    },
    AIR: {
      icon: "/assets/squad-icons/air.png",
      neon: "rgba(138,43,226,0.85)",
      neonLight: "rgba(138,43,226,0.45)",
      border: "rgba(138,43,226,0.25)",
      bg: "rgba(138,43,226,0.12)",
      fg: "rgba(170,120,255,0.95)"
    },
    MISSILE: {
      icon: "/assets/squad-icons/missile.png",
      neon: "rgba(255,50,50,0.85)",
      neonLight: "rgba(255,50,50,0.45)",
      border: "rgba(255,50,50,0.25)",
      bg: "rgba(255,50,50,0.12)",
      fg: "rgba(255,80,80,0.95)"
    }
  };

  if (primary && hybrid) {
    return {
      icon: base[primary].icon,
      neon: GOLD.neon,
      neonLight: GOLD.neonLight,
      border: GOLD.border,
      bg: "rgba(255,210,60,0.12)",
      fg: "rgba(255,230,150,1)",
      label: `HYBRID (${primary})`
    };
  }

  if (primary) return { ...base[primary], label: primary };

  return {
    icon: "/assets/squad-icons/default.png",
    neon: "rgba(255,255,255,0.6)",
    neonLight: "rgba(255,255,255,0.25)",
    border: "rgba(255,255,255,0.12)",
    bg: "rgba(255,255,255,0.05)",
    fg: "rgba(255,255,255,0.65)",
    label: "—"
  };
}

function parseOldSquad(str) {
  const s = String(str || "").toUpperCase();
  let primary = null;

  if (s.includes("TANK")) primary = "TANK";
  else if (s.includes("AIR")) primary = "AIR";
  else if (s.includes("MISSILE")) primary = "MISSILE";

  const hybrid = s.includes("HYBRID");
  return { primary, hybrid };
}

/* Rank visuals: applies ONLY to the rank badge */
function getRankVisual(rank) {
  if (rank === 1) return { medal: "🥇", glow: "gold", color: "rgba(255,210,60,1)", pulse: true };
  if (rank === 2) return { medal: "🥈", glow: "silver", color: "rgba(220,220,220,1)", pulse: true };
  if (rank === 3) return { medal: "🥉", glow: "bronze", color: "rgba(205,127,50,1)", pulse: true };

  if (rank <= 5)
    return { medal: "", glow: "gold", color: "rgba(255,210,60,1)", pulse: false };

  if (rank <= 15)
    return { medal: "", glow: "neon", color: "rgba(0,255,180,1)", pulse: false };

  return { medal: "", glow: "none", color: "rgba(255,255,255,0.65)", pulse: false };
}

export function renderCards(gridEl, members, options = {}) {

  // Sort members by POWER and assign ranks
  members = [...members]
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0))
    .map((m, i) => ({
      ...m,
      rankNumber: i + 1,
      rankVisual: getRankVisual(i + 1)
    }));

  gridEl.innerHTML = "";
  const showAdminActions = !!options.showAdminActions;

  members.forEach((m) => {
    const primary = m.squadPrimary || parseOldSquad(m.squad).primary;
    const hybrid = m.squadHybrid || parseOldSquad(m.squad).hybrid;
    const squadInfo = squadPillProps(primary, hybrid);

    const power =
      m.power !== undefined && m.power !== null
        ? Number(m.power).toFixed(1)
        : "0.0";

    const powerType = m.powerType || "Precise";
    const fullName = m.name || "";
    const role = m.role || "";

    const mainName = fullName.replace(/\(.+\)/, "").trim();
    const bracketName = (fullName.match(/\(.+\)/)?.[0] || "").trim();

    let lastTsMs = m.lastUpdated?.toMillis ? m.lastUpdated.toMillis() : "";
    const updatedLabel = lastTsMs
      ? "Updated " + timeAgoInitial(lastTsMs)
      : "Updated never";

    const glowIntensity = hybrid ? 55 : Math.min(45, Number(power) * 0.9);

    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.id = m.id;

    card.style.cssText = `
      margin:10px;
      padding:14px;
      border-radius:16px;
      background: linear-gradient(145deg, rgba(30,33,40,0.75), rgba(18,20,24,0.75));
      border: 2px solid ${squadInfo.neon};
      box-shadow:
        0 0 ${glowIntensity}px ${squadInfo.neonLight},
        inset 0 0 20px rgba(255,255,255,0.06);
      position: relative;
      overflow: hidden;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    `;

    const gloss = document.createElement("div");
    gloss.style.cssText = `
      position:absolute;
      top:-160%;
      left:-160%;
      width:400%;
      height:400%;
      opacity:0;
      transform:rotate(25deg);
      background: linear-gradient(
        115deg,
        transparent 0%,
        rgba(255,255,255,0.18) 20%,
        rgba(255,255,255,0.28) 30%,
        transparent 60%
      );
      transition:opacity .3s ease;
      pointer-events:none;
    `;
    card.appendChild(gloss);

    card.onmouseover = () => {
      gloss.style.animation = "glossMove 1.4s linear forwards";
      gloss.style.opacity = "1";
      card.style.transform = "translateY(-6px) rotateX(6deg)";
    };

    card.onmouseout = () => {
      gloss.style.animation = "";
      gloss.style.opacity = "0";
      card.style.transform = "translateY(0)";
    };

    // FULL CARD INNER HTML (updated layout)
    card.innerHTML += `
      <div style="display:flex;">

        <!-- LEFT SIDE: Rank badge + name + role + label -->
        <div style="
          flex:1;
          min-width:0;
          max-width:calc(100% - 70px);
          overflow:hidden;
        ">
          <div style="display:flex; gap:0.75rem; align-items:center;">

            <!-- RANK BADGE -->
            <div style="
              width:44px;height:44px;border-radius:10px;
              background:rgba(255,255,255,0.03);
              border:2px solid ${m.rankVisual.color};
              display:flex;align-items:center;justify-content:center;
              font-weight:700;font-size:1.05rem;color:${m.rankVisual.color};
              box-shadow:0 0 ${m.rankVisual.glow === 'gold' ? '18px rgba(255,210,60,0.45)' : 
                               m.rankVisual.glow === 'neon' ? '14px rgba(0,255,180,0.28)' : 
                               '0 transparent'};
              ${m.rankVisual.pulse ? 'animation: medalPulse 1.6s ease-in-out infinite;' : ''}
            ">
              ${escapeHtml(m.rankVisual.medal || (m.rankNumber ?? "-"))}
            </div>

            <div style="flex:1; min-width:0;">
              <div style="font-size:1rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(mainName)}
              </div>

              ${bracketName ? `<div style="font-size:0.85rem;color:rgba(255,255,255,0.55); margin-top:4px;">${escapeHtml(bracketName)}</div>` : ""}

              <div style="font-size:0.85rem; opacity:0.75; margin-top:4px;">
                ${escapeHtml(role)}
              </div>

              <div style="margin-top:6px;">
                <span style="padding:4px 8px;border-radius:999px;background:${squadInfo.bg};color:${squadInfo.fg};border:1px solid ${squadInfo.border};font-size:0.78rem;font-weight:600;">
                  ${escapeHtml(squadInfo.label)}
                </span>
              </div>

              <div class="muted xsmall" style="margin-top:8px; opacity:0.75;">
                ${escapeHtml(updatedLabel)}
              </div>
            </div>

          </div>
        </div>

        <!-- RIGHT SIDE: POWER ABOVE ICON + TYPE BELOW ICON -->
        <div style="
          width:70px;
          min-width:70px;
          max-width:70px;
          flex-shrink:0;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:6px;
        ">

          <!-- POWER -->
          <div style="
            font-size:1.1rem;
            font-weight:700;
            color:#fff;
            text-shadow:0 0 6px rgba(255,255,255,0.45);
          ">
            ${escapeHtml(power)}
          </div>

          <!-- ICON BOX -->
          <div style="
            width:48px;
            height:48px;
            border-radius:8px;
            border:${hybrid ? "6px" : "2px"} solid ${squadInfo.neon};
            display:flex;
            align-items:center;
            justify-content:center;
            background:rgba(255,255,255,0.03);
            box-shadow:0 0 ${hybrid ? "22px" : "12px"} ${hybrid ? GOLD.neonLight : squadInfo.neonLight};
          ">
            <img src="${squadInfo.icon}" 
              style="width:40px;height:40px;object-fit:contain;
              filter: drop-shadow(0 0 ${hybrid ? "12px" : "6px"} ${squadInfo.neon});
            ">
          </div>

          <!-- APPROX / PRECISE -->
          <div style="
            font-size:0.75rem;
            font-weight:600;
            margin-top:2px;
            color:${powerType === "Approx" ? "rgba(255,210,0,1)" : "rgba(0,255,180,1)"};
            text-align:center;
          ">
            ${escapeHtml(powerType)}
          </div>

        </div>

      </div>

      <div class="admin-btn-row" style="margin-top:10px; display:flex; gap:0.5rem;">
        ${ showAdminActions ? `
          <button class="btn btn-edit" data-id="${m.id}">Edit</button>
          <button class="btn btn-delete" data-id="${m.id}">Delete</button>
        ` : "" }
      </div>
    `;

    if (showAdminActions) {
      const editBtn = card.querySelector(".btn-edit");
      const deleteBtn = card.querySelector(".btn-delete");
      if (editBtn) editBtn.addEventListener("click", () => options.onEdit?.(m));
      if (deleteBtn) deleteBtn.addEventListener("click", () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

function timeAgoInitial(ms) {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " mins ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hrs ago";
  return Math.floor(diff / 86400) + " days ago";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
