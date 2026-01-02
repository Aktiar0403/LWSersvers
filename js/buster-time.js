/* ======================================
   BUSTER TIME ENGINE (IST)
   SINGLE SOURCE OF TRUTH
====================================== */

const IST_OFFSET_MINUTES = 330;

function nowIST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + IST_OFFSET_MINUTES * 60000);
}

function isBusterLive(istNow) {
  const day = istNow.getDay(); // 0=Sun, 6=Sat

  // Saturday from 7:30 AM IST
  if (day === 6) {
    const start = new Date(istNow);
    start.setHours(7, 30, 0, 0);
    return istNow >= start;
  }

  // Sunday until 7:30 AM IST
  if (day === 0) {
    const end = new Date(istNow);
    end.setHours(7, 30, 0, 0);
    return istNow < end;
  }

  return false;
}

function getNextSaturday730(istNow) {
  const d = new Date(istNow);
  const day = d.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7;

  d.setDate(d.getDate() + daysUntilSaturday);
  d.setHours(7, 30, 0, 0);

  if (istNow >= d) {
    d.setDate(d.getDate() + 7);
  }

  return d;
}

function format(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  return `${d}d ${h}h ${m}m ${sec}s`;
}

/* ======================================
   PUBLIC API
====================================== */

export function getBusterState() {
  const istNow = nowIST();
  const live = isBusterLive(istNow);

  if (live) {
    const end = new Date(istNow);
    end.setDate(end.getDate() + (end.getDay() === 6 ? 1 : 0));
    end.setHours(7, 30, 0, 0);

    const remaining = end - istNow;

    return {
      live: true,
      text:
        remaining > 0
          ? `🔥 LIVE · Ends in ${format(remaining)}`
          : "🔥 LIVE · Ending…"
    };
  }

  const next = getNextSaturday730(istNow);
  return {
    live: false,
    text: `in · ${format(next - istNow)}`
  };
}
