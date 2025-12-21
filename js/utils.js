// js/utils.js

export function starsString(n) {
  const v = Math.max(1, Math.min(5, n || 1));
  return '★★★★★'.slice(0, v) + '☆☆☆☆☆'.slice(0, 5 - v);
}

export function cleanNumber(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export function exportMembersToCSV(members) {
  const headers = ['name', 'role', 'squad', 'power', 'stars'];
  const lines = [headers.join(',')];

  members.forEach(m => {
    const row = [
      (m.name || '').replace(/,/g, ' '),
      (m.role || '').replace(/,/g, ' '),
      (m.squad || '').replace(/,/g, ' '),
      m.power ?? 0,
      m.stars ?? 1
    ];
    lines.push(row.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'squad_members.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length <= 1) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[0]) continue;
    out.push({
      name: cols[0].trim(),
      role: (cols[1] || '').trim(),
      squad: (cols[2] || '').trim(),
      power: cleanNumber(cols[3]),
      stars: Math.max(1, Math.min(5, parseInt(cols[4]) || 3))
    });
  }
  return out;
}
