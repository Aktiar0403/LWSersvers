// admin-fights.js (v3) — Prevent cross-team duplicates + multi-select modal (click toggles)

console.log("✅ admin-fights.js (v3) loaded");

import { db } from './firebase-config.js';
import { logAudit } from './audit.js'; // optional

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===========================
   Constants & State
   =========================== */
const WEEKS_COLLECTION = 'desert_brawl_weeks';
const membersCache = []; // populated by subscribeMembers
const teams = {
  A: { main: [], subs: [], ui: {} },
  B: { main: [], subs: [], ui: {} }
};
let activeModal = null;

/* ===========================
   Small helpers
   =========================== */
const $ = id => document.getElementById(id);

function uid(prefix='id') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const cleaned = String(v).replace(/[^\d.-]/g, '');
  const m = Number(cleaned);
  return Number.isFinite(m) ? m : 0;
}

function getISOWeekLabel() {
  const now = new Date();
  const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
  return `week-${tmp.getUTCFullYear()}-${String(weekNo).padStart(2,'0')}`;
}

function sanitizeId(s) {
  if (!s) return null;
  return s.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'').toLowerCase();
}

/* ===========================
   Derived hybrid category (Option 1)
   =========================== */
function derivedHybridCategory(member) {
  const squad = (member.squad || '').toUpperCase();
  const role = (member.role || '').toUpperCase();
  if (squad !== 'HYBRID') return squad || '';
  if (role.includes('AIR')) return 'HYBRID-AIR';
  if (role.includes('TANK')) return 'HYBRID-TANK';
  const name = (member.name || '').toUpperCase();
  if (name.includes('AIR')) return 'HYBRID-AIR';
  if (name.includes('TANK')) return 'HYBRID-TANK';
  return 'HYBRID';
}

/* ===========================
   Firestore: subscribe members
   =========================== */
function subscribeMembers() {
  try {
    const q = query(collection(db, 'members'), orderBy('name'));
    onSnapshot(q, snap => {
      membersCache.length = 0;
      snap.docs.forEach(d => membersCache.push({ id: d.id, ...d.data() }));
      // refresh modal list if open
      if (activeModal && activeModal.type === 'add-player') activeModal.refresh();
    }, err => {
      console.warn('members snapshot error', err);
    });
  } catch (e) {
    console.warn('Firestore members subscription unavailable', e);
  }
}

/* ===========================
   UI bindings
   =========================== */
function bindUI() {
  // Team A UI
  teams.A.ui.name = $('teamAName'); 
  teams.A.ui.squad = $('teamASquad');
  teams.A.ui.mainList = $('teamAMainList'); 
  teams.A.ui.subList = $('teamASubList');
  teams.A.ui.mainPower = $('teamAMainPower'); 
  teams.A.ui.subPower = $('teamASubPower'); 
  teams.A.ui.totalPower = $('teamATotalPower');
  teams.A.ui.addMain = $('addTeamAMain'); 
  teams.A.ui.addSub = $('addTeamASub'); 
  teams.A.ui.mainCounts = $('teamAMainCounts');
  teams.A.ui.mainCountLabel = $('teamAMainCount'); 
  teams.A.ui.subCountLabel = $('teamASubCount');

  // Team B UI
  teams.B.ui.name = $('teamBName'); 
  teams.B.ui.squad = $('teamBSquad');
  teams.B.ui.mainList = $('teamBMainList'); 
  teams.B.ui.subList = $('teamBSubList');
  teams.B.ui.mainPower = $('teamBMainPower'); 
  teams.B.ui.subPower = $('teamBSubPower'); 
  teams.B.ui.totalPower = $('teamBTotalPower');
  teams.B.ui.addMain = $('addTeamBMain'); 
  teams.B.ui.addSub = $('addTeamBSub'); 
  teams.B.ui.mainCounts = $('teamBMainCounts');
  teams.B.ui.mainCountLabel = $('teamBMainCount'); 
  teams.B.ui.subCountLabel = $('teamBSubCount');

  // Week controls
  $('autoWeekBtn')?.addEventListener('click', () => { 
    $('weekLabel').value = getISOWeekLabel(); 
  });
  $('saveWeekBtn')?.addEventListener('click', saveWeek);
  $('loadWeekBtn')?.addEventListener('click', loadSelectedWeek);
  $('deleteWeekBtn')?.addEventListener('click', deleteSelectedWeek);
  $('clearAllBtn')?.addEventListener('click', clearAllTeams);
  $('exportWeekBtn')?.addEventListener('click', exportCurrentWeekJSON);

  // Add player buttons
  teams.A.ui.addMain?.addEventListener('click', () => openAddPlayerModal('A','main'));
  teams.A.ui.addSub?.addEventListener('click', () => openAddPlayerModal('A','sub'));
  teams.B.ui.addMain?.addEventListener('click', () => openAddPlayerModal('B','main'));
  teams.B.ui.addSub?.addEventListener('click', () => openAddPlayerModal('B','sub'));
}

/* ===========================
   Rendering helpers
   =========================== */
function countSquads(playerArray) {
  const out = { TANK:0, AIR:0, MISSILE:0, HYBRID:0 };
  playerArray.forEach(p => {
    const s = (p.squad || '').toUpperCase();
    if (!s) return;
    if (s.startsWith('HYBRID')) out.HYBRID++; // derived hybrid categories count as HYBRID
    else if (out[s] !== undefined) out[s]++;
  });
  return out;
}

function renderTeam(side) {
  const t = teams[side];
  if (!t) return;

  // main list
  t.ui.mainList.innerHTML = '';
  t.main.forEach((p, idx) => t.ui.mainList.appendChild(playerRow(side,'main',p,idx)));

  // subs list
  t.ui.subList.innerHTML = '';
  t.subs.forEach((p, idx) => t.ui.subList.appendChild(playerRow(side,'sub',p,idx)));

  // totals
  const mainSum = t.main.reduce((s,p) => s + toNumber(p.power), 0);
  const subSum = t.subs.reduce((s,p) => s + toNumber(p.power), 0);
  t.ui.mainPower.textContent = mainSum;
  t.ui.subPower.textContent = subSum;
  t.ui.totalPower.textContent = mainSum + subSum;

  // counts
  t.ui.mainCountLabel.textContent = t.main.length;
  t.ui.subCountLabel.textContent = t.subs.length;

  const counts = countSquads(t.main);
  t.ui.mainCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<div class="count-pill">${k}: ${v}</div>`).join('');
  // enable/disable add buttons
  t.ui.addMain.disabled = t.main.length >= 20;
  t.ui.addSub.disabled = t.subs.length >= 10;
}

function playerRow(side, bucket, p, idx) {
  const row = document.createElement('div');
  row.className = 'player-row';

  const left = document.createElement('div');
  left.className = 'left';
  left.textContent = p.name || '(unnamed)';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const pwr = document.createElement('span');
  pwr.className = 'pwr';
  if ((p.powerType||'').toUpperCase() === 'APPROX') { 
    pwr.style.color='#999'; 
    pwr.textContent = '≈' + (p.power ?? 0); 
  } else { 
    pwr.style.color='#00ffc8'; 
    pwr.textContent = (p.power ?? 0); 
  }
  const squadEl = document.createElement('span'); 
  squadEl.className='squad'; 
  squadEl.textContent = p.squad || '';
  meta.appendChild(pwr); 
  meta.appendChild(squadEl);

  const actions = document.createElement('div'); 
  actions.className='actions';
  const rem = document.createElement('button'); 
  rem.className='btn ghost'; 
  rem.textContent='Remove';
  rem.addEventListener('click', () => removePlayer(side, bucket, idx));
  actions.appendChild(rem);

  row.appendChild(left);
  row.appendChild(meta);
  row.appendChild(actions);
  return row;
}

/* ===========================
   Duplicate checks
   =========================== */
// Check if member id exists in either team (optionally excluding same side)
function isMemberInTeam(memberId, side) {
  if (!memberId) return false;
  const t = teams[side];
  return t.main.some(p => p.id === memberId) || t.subs.some(p => p.id === memberId);
}

function isMemberInOtherTeam(memberId, side) {
  const other = (side === 'A') ? 'B' : 'A';
  return isMemberInTeam(memberId, other);
}

/* ===========================
   Add / remove players (with cross-team prevention)
   =========================== */
function addPlayerToTeam(side, bucket, player) {
  const t = teams[side];
  if (!t) return;

  // if player has id and exists in the opposite team -> block
  if (player.id && isMemberInOtherTeam(player.id, side)) {
    const other = (side === 'A') ? 'B' : 'A';
    alert(`This member already exists in Team ${other}. Cannot add to both teams.`);
    return;
  }

  // prevent duplicate within same team
  if (player.id && isMemberInTeam(player.id, side)) {
    alert('This member already exists in this team.');
    return;
  }

  // add to chosen bucket with limits
  const normalized = normalizePlayer(player);
  if (bucket === 'main') {
    if (t.main.length >= 20) { 
      alert('Main limit 20 reached'); 
      return; 
    }
    t.main.push(normalized);
  } else {
    if (t.subs.length >= 10) { 
      alert('Sub limit 10 reached'); 
      return; 
    }
    t.subs.push(normalized);
  }
  renderTeam(side);
}

function removePlayer(side, bucket, idx) {
  const t = teams[side];
  if (!t) return;
  if (bucket === 'main') t.main.splice(idx,1);
  else t.subs.splice(idx,1);
  renderTeam(side);
}

function normalizePlayer(p) {
  // prefer DB derived squad when id present
  let squad = (p.squad || '').toUpperCase();
  if (p.id) {
    const mem = membersCache.find(m => m.id === p.id);
    if (mem) {
      squad = derivedHybridCategory(mem);
    }
  }
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: squad || '',
    powerType: p.powerType || 'Precise'
  };
}

/* ===========================
   Modal: Multi-select (click toggles)
   =========================== */
function openAddPlayerModal(side, bucket) {
  closeModal(); // ensure single

  // overlay
  const overlay = document.createElement('div');
  overlay.style.position='fixed'; 
  overlay.style.inset='0'; 
  overlay.style.background='rgba(64, 47, 212, 0.25)';
  overlay.style.display='flex'; 
  overlay.style.alignItems='center'; 
  overlay.style.justifyContent='center'; 
  overlay.style.zIndex=99999;

  // box
  const box = document.createElement('div');
  box.style.width='760px'; 
  box.style.maxWidth='98%'; 
  box.style.maxHeight='86%'; 
  box.style.overflow='auto';
  box.style.background='rgba(6,6,10,0.98)'; 
  box.style.border='1px solid rgba(1, 190, 204, 1)'; 
  box.style.padding='14px'; 
  box.style.borderRadius='12px';
  overlay.appendChild(box);

  // header
  const header = document.createElement('div'); 
  header.style.display='flex'; 
  header.style.justifyContent='space-between'; 
  header.style.alignItems='center';
  const title = document.createElement('h3'); 
  title.textContent = `${side==='A'?'Team A':'Team B'} — Add ${bucket==='main'?'Main':'Sub'} Players`; 
  title.style.color='#00ffc8'; 
  title.style.margin=0;
  header.appendChild(title);
  const closeBtn = document.createElement('button'); 
  closeBtn.className='btn ghost'; 
  closeBtn.textContent='Close'; 
  closeBtn.addEventListener('click', closeModal);
  header.appendChild(closeBtn);
  box.appendChild(header);

  // controls: search + squad filters + sort
  const controls = document.createElement('div'); 
  controls.style.display='flex'; 
  controls.style.gap='8px'; 
  controls.style.margin='12px 0'; 
  controls.style.flexWrap='wrap';
  const search = document.createElement('input'); 
  search.className='input'; 
  search.placeholder='Search name...'; 
  search.style.flex='1';
  controls.appendChild(search);

  // squad filter buttons
  const squads = ['ALL','TANK','AIR','MISSILE','HYBRID-AIR','HYBRID-TANK','HYBRID'];
  const squadGroup = document.createElement('div'); 
  squadGroup.style.display='flex'; 
  squadGroup.style.gap='6px';
  squads.forEach(sq => {
    const b = document.createElement('button'); 
    b.className='btn ghost'; 
    b.textContent=sq; 
    b.dataset.squad=sq;
    b.addEventListener('click', () => {
      Array.from(squadGroup.children).forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); 
      modalState.squadFilter = sq; 
      refreshList();
    });
    squadGroup.appendChild(b);
  });
  controls.appendChild(squadGroup);

  // sort
  const sortGroup = document.createElement('div'); 
  sortGroup.style.display='flex'; 
  sortGroup.style.gap='6px';
  const sd = document.createElement('button'); 
  sd.className='btn ghost'; 
  sd.textContent='Power ↓'; 
  sd.dataset.sort='desc';
  const sa = document.createElement('button'); 
  sa.className='btn ghost'; 
  sa.textContent='Power ↑'; 
  sa.dataset.sort='asc';
  sd.addEventListener('click', () => { 
    modalState.sort='desc'; 
    sd.classList.add('active'); 
    sa.classList.remove('active'); 
    refreshList(); 
  });
  sa.addEventListener('click', () => { 
    modalState.sort='asc'; 
    sa.classList.add('active'); 
    sd.classList.remove('active'); 
    refreshList(); 
  });
  sortGroup.appendChild(sd); 
  sortGroup.appendChild(sa);
  controls.appendChild(sortGroup);

  box.appendChild(controls);

  // list container
  const listWrap = document.createElement('div');
  listWrap.style.border='1px solid rgba(255,255,255,0.03)'; 
  listWrap.style.borderRadius='8px'; 
  listWrap.style.padding='10px';
  listWrap.style.maxHeight='360px'; 
  listWrap.style.overflow='auto';
  box.appendChild(listWrap);

  // manual entry
  const manual = document.createElement('div'); 
  manual.style.marginTop='12px';
  manual.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
    <input class="input" id="manualName" placeholder="Manual name (if not selecting)" style="flex:1"/>
    <input class="input" id="manualPower" placeholder="Power" style="width:120px" type="number"/>
    <select class="input" id="manualSquad" style="width:160px">
      <option value="">Squad (optional)</option>
      <option value="TANK">TANK</option>
      <option value="AIR">AIR</option>
      <option value="MISSILE">MISSILE</option>
      <option value="HYBRID">HYBRID</option>
    </select>
    <select class="input" id="manualPowerType" style="width:120px">
      <option value="Precise">Precise</option>
      <option value="Approx">Approx</option>
    </select>
  </div>`;
  box.appendChild(manual);

  // actions
  const actions = document.createElement('div'); 
  actions.style.display='flex'; 
  actions.style.justifyContent='flex-end'; 
  actions.style.gap='8px'; 
  actions.style.marginTop='12px';
  const cancel = document.createElement('button'); 
  cancel.className='btn ghost'; 
  cancel.textContent='Cancel'; 
  cancel.addEventListener('click', closeModal);
  const addManual = document.createElement('button'); 
  addManual.className='btn primary'; 
  addManual.textContent='Add Manual';
  addManual.addEventListener('click', () => {
    const name = box.querySelector('#manualName').value.trim();
    const power = box.querySelector('#manualPower').value;
    const squad = box.querySelector('#manualSquad').value;
    const ptype = box.querySelector('#manualPowerType').value || 'Precise';
    if (!name) return alert('Enter manual name or select members.');
    const player = { 
      id: null, 
      name, 
      power: toNumber(power), 
      squad, 
      powerType: ptype 
    };
    addPlayerToTeam(side, bucket, player);
    closeModal();
  });

  const addSelected = document.createElement('button'); 
  addSelected.className='btn primary'; 
  addSelected.textContent='Add Selected';
  addSelected.addEventListener('click', () => {
    const ids = modalState.selectedIds.slice();
    if (!ids.length) return alert('No members selected. Click rows to select multiple.');
    // try to add all selected one by one with cross-team checks
    let blocked = [];
    for (const mid of ids) {
      const mem = membersCache.find(x => x.id === mid);
      if (!mem) continue;
      // cross-team check
      if (isMemberInOtherTeam(mem.id, side)) {
        blocked.push(mem.name + ` (in other team)`);
        continue;
      }
      // duplicate within same team check
      if (isMemberInTeam(mem.id, side)) {
        blocked.push(mem.name + ` (already in same team)`);
        continue;
      }
      const player = { 
        id: mem.id, 
        name: mem.name, 
        power: mem.power ?? 0, 
        squad: derivedHybridCategory(mem), 
        powerType: mem.powerType || 'Precise' 
      };
      // enforce limits: if adding would exceed, stop adding further and inform
      const t = teams[side];
      const remainMain = 20 - t.main.length;
      const remainSub = 10 - t.subs.length;
      if ((bucket==='main' && remainMain <= 0) || (bucket==='sub' && remainSub <= 0)) {
        blocked.push(mem.name + ' (limit reached)');
        continue;
      }
      addPlayerToTeam(side, bucket, player);
    }
    if (blocked.length) alert('Some members could not be added:\n' + blocked.join('\n'));
    closeModal();
  });

  actions.appendChild(cancel); 
  actions.appendChild(addManual); 
  actions.appendChild(addSelected);
  box.appendChild(actions);

  // modal state
  const modalState = {
    squadFilter: 'ALL',
    sort: 'desc',
    search: '',
    selectedIds: []
  };

  // initial active states
  Array.from(squadGroup.children).forEach(b => { 
    if (b.dataset.squad === 'ALL') b.classList.add('active'); 
  });
  sd.classList.add('active');

  // search wiring
  search.addEventListener('input', (e) => { 
    modalState.search = e.target.value.trim().toLowerCase(); 
    refreshList(); 
  });

  // expose for updates
  activeModal = {
    overlay,
    box,
    type: 'add-player',
    state: modalState,
    refresh: refreshList
  };

  document.body.appendChild(overlay);
  search.focus();
  refreshList();

  /* ---------- refreshList closure ---------- */
  function refreshList() {
    listWrap.innerHTML = '';
    // build list from membersCache
    let list = membersCache.map(m => ({ 
      id: m.id, 
      name: m.name, 
      power: toNumber(m.power), 
      squadRaw: (m.squad||'').toUpperCase(), 
      role: (m.role||''), 
      powerType: m.powerType || 'Precise' 
    }));
    
    // derive display squad
    list = list.map(m => ({ 
      ...m, 
      displaySquad: (m.squadRaw === 'HYBRID') ? derivedHybridCategory(m) : (m.squadRaw || '') 
    }));
    
    // squad filter
    if (modalState.squadFilter && modalState.squadFilter !== 'ALL') {
      const sf = modalState.squadFilter;
      list = list.filter(m => {
        if (sf === 'HYBRID-AIR' || sf === 'HYBRID-TANK') return m.displaySquad === sf;
        if (sf === 'HYBRID') return m.displaySquad.startsWith('HYBRID');
        return m.displaySquad === sf || m.squadRaw === sf;
      });
    }
    
    // search
    if (modalState.search) {
      list = list.filter(m => 
        (m.name + ' ' + (m.displaySquad||'') + ' ' + (m.role||'')).toLowerCase().includes(modalState.search)
      );
    }
    
    // sort
    if (modalState.sort === 'desc') list.sort((a,b) => b.power - a.power);
    else list.sort((a,b) => a.power - b.power);

    // build DOM items
    list.forEach(m => {
      const item = document.createElement('div');
      item.style.display='flex'; 
      item.style.justifyContent='space-between'; 
      item.style.alignItems='center';
      item.style.padding='8px'; 
      item.style.borderRadius='8px'; 
      item.style.marginBottom='6px'; 
      item.style.cursor='pointer';
      item.style.background = modalState.selectedIds.includes(m.id) ? 'rgba(0, 200, 255, 0.2)' : 'transparent';
      
      // If member exists in other team, grey it out and add note
      const inOther = isMemberInOtherTeam(m.id, side);
      if (inOther) item.style.opacity = '0.55';

      item.addEventListener('click', (e) => {
        // toggle selection (Multi A behavior)
        if (modalState.selectedIds.includes(m.id)) {
          modalState.selectedIds = modalState.selectedIds.filter(x => x !== m.id);
          item.style.background = 'transparent';
        } else {
          modalState.selectedIds.push(m.id);
          item.style.background = 'rgba(0,255,200,0.22)';
item.style.boxShadow = '0 0 10px rgba(0,255,200,0.35)';
item.style.border = '1px solid rgba(0,255,200,0.45)';
        }
      });

      const left = document.createElement('div'); 
      left.style.display='flex'; 
      left.style.flexDirection='column';
      const nameEl = document.createElement('div'); 
      nameEl.textContent = m.name; 
      nameEl.style.color='#eaeaea'; 
      nameEl.style.fontWeight='600';
      const subEl = document.createElement('div'); 
      subEl.textContent = `${m.displaySquad || ''}${m.role ? ' • ' + m.role : ''}`; 
      subEl.style.color='#aaa'; 
      subEl.style.fontSize='12px';
      left.appendChild(nameEl); 
      left.appendChild(subEl);

      // Right side container
      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';
      right.style.gap = '3px';

      // POWER (≈ approximation logic)
      const pwrEl = document.createElement('div');
      pwrEl.style.fontWeight = '700';
      if (m.powerType && m.powerType.toUpperCase() === 'APPROX') {
        pwrEl.textContent = '≈' + m.power;
        pwrEl.style.color = '#999';
      } else {
        pwrEl.textContent = m.power;
        pwrEl.style.color = '#00ffc8';
      }
      right.appendChild(pwrEl);

      // SQUAD LABEL
      const badgeSquad = document.createElement('div');
      badgeSquad.textContent = m.displaySquad || '';
      badgeSquad.style.color = '#ddd';
      badgeSquad.style.fontSize = '12px';
      right.appendChild(badgeSquad);

      item.appendChild(left);
      item.appendChild(right);

      // BADGE: Already in same team?
      if (isMemberInTeam(m.id, side)) {
        const inTeam = document.createElement('div');
        inTeam.textContent = "IN TEAM";
        inTeam.style.color = "#7bb2ff";
        inTeam.style.fontSize = "11px";
        inTeam.style.padding = "1px 6px";
        inTeam.style.border = "1px solid rgba(120,160,255,0.4)";
        inTeam.style.borderRadius = "6px";
        right.appendChild(inTeam);
      }

      // BADGE: Already in OTHER team?
      if (isMemberInOtherTeam(m.id, side)) {
        const otherTeam = document.createElement('div');
        otherTeam.textContent = "OTHER TEAM";
        otherTeam.style.color = "#ff7b7b";
        otherTeam.style.fontSize = "11px";
        otherTeam.style.padding = "1px 6px";
        otherTeam.style.border = "1px solid rgba(255,120,120,0.4)";
        otherTeam.style.borderRadius = "6px";
        right.appendChild(otherTeam);
      }

      listWrap.appendChild(item);
    });

    if (!list.length) {
      const hint = document.createElement('div'); 
      hint.style.color='#888'; 
      hint.style.padding='12px'; 
      hint.textContent = 'No members found.';
      listWrap.appendChild(hint);
    }
  }
}

/* ===========================
   close modal
   =========================== */
function closeModal() {
  if (activeModal && activeModal.overlay) {
    try { 
      document.body.removeChild(activeModal.overlay); 
    } catch(e) {}
  }
  activeModal = null;
}

/* ===========================
   Weeks: save / load / delete / export
   =========================== */
function buildWeekPayload() {
  return {
    label: $('weekLabel').value || getISOWeekLabel(),
    savedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    teamA: { 
      name: teams.A.ui.name?.value || '', 
      squad: teams.A.ui.squad?.value || '', 
      main: teams.A.main, 
      subs: teams.A.subs 
    },
    teamB: { 
      name: teams.B.ui.name?.value || '', 
      squad: teams.B.ui.squad?.value || '', 
      main: teams.B.main, 
      subs: teams.B.subs 
    }
  };
}

async function saveWeek() {
  const rawLabel = ($('weekLabel').value || '').trim();
  const label = rawLabel || getISOWeekLabel();
  const id = sanitizeId(label) || uid('week');
  const payload = buildWeekPayload();
  try {
    await setDoc(doc(db, WEEKS_COLLECTION, id), payload);
    alert('Saved week: ' + label);
    if (typeof logAudit === 'function') logAudit('SAVE_WEEK', label, '', window?.currentAdminName || 'admin');
    await refreshSavedWeeks();
    $('savedWeeks').value = id;
  } catch (e) {
    console.error('saveWeek error', e);
    alert('Save failed');
  }
}

async function refreshSavedWeeks() {
  try {
    const snap = await getDocs(collection(db, WEEKS_COLLECTION));
    const sel = $('savedWeeks'); 
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Load saved week --</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id; 
      opt.textContent = d.data().label || d.id;
      sel.appendChild(opt);
    });
  } catch (e) { 
    console.warn('refreshSavedWeeks error', e); 
  }
}

async function loadSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose a saved week');
  try {
    const snap = await getDoc(doc(db, WEEKS_COLLECTION, id));
    if (!snap.exists()) return alert('Week not found');
    const data = snap.data(); 
    applyLoadedWeek(data);
    $('weekLabel').value = data.label || id;
  } catch (e) { 
    console.error('load error', e); 
    alert('Load failed'); 
  }
}

function applyLoadedWeek(data) {
  teams.A.main = (data.teamA?.main || []).map(p => normalizeForLoad(p));
  teams.A.subs = (data.teamA?.subs || []).map(p => normalizeForLoad(p));
  teams.B.main = (data.teamB?.main || []).map(p => normalizeForLoad(p));
  teams.B.subs = (data.teamB?.subs || []).map(p => normalizeForLoad(p));
  
  if (teams.A.ui.name) teams.A.ui.name.value = data.teamA?.name || '';
  if (teams.A.ui.squad) teams.A.ui.squad.value = data.teamA?.squad || '';
  if (teams.B.ui.name) teams.B.ui.name.value = data.teamB?.name || '';
  if (teams.B.ui.squad) teams.B.ui.squad.value = data.teamB?.squad || '';
  
  renderTeam('A'); 
  renderTeam('B');
}

function normalizeForLoad(p) {
  return {
    id: p.id || null,
    name: p.name || '',
    power: toNumber(p.power),
    squad: (p.squad || '').toUpperCase(),
    powerType: p.powerType || 'Precise'
  };
}

async function deleteSelectedWeek() {
  const id = $('savedWeeks').value;
  if (!id) return alert('Choose saved week');
  if (!confirm('Delete saved week?')) return;
  try {
    await deleteDoc(doc(db, WEEKS_COLLECTION, id));
    alert('Deleted');
    await refreshSavedWeeks();
  } catch (e) { 
    console.error('delete week error', e); 
    alert('Delete failed'); 
  }
}

function exportCurrentWeekJSON() {
  const payload = buildWeekPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href=url; 
  a.download = `${payload.label || 'week'}.json`; 
  document.body.appendChild(a); 
  a.click(); 
  a.remove();
  URL.revokeObjectURL(url);
}

function clearAllTeams() {
  if (!confirm('Clear both teams?')) return;
  teams.A.main = []; 
  teams.A.subs = []; 
  teams.B.main = []; 
  teams.B.subs = [];
  renderTeam('A'); 
  renderTeam('B');
  $('weekLabel').value = '';
}

/* ===========================
   Utility / init
   =========================== */
function normalizePlayerObj(p) {
  return { 
    id: p.id || null, 
    name: p.name || '', 
    power: toNumber(p.power), 
    squad: (p.squad || '').toUpperCase(), 
    powerType: p.powerType || 'Precise' 
  };
}

function init() {
  setupTeamSwitcher();
  bindUI();
  subscribeMembers();
  refreshSavedWeeks();
  renderTeam('A');
  renderTeam('B');
  $('weekLabel').value = getISOWeekLabel();
}

function setupTeamSwitcher() {
  const btnA = document.getElementById("btnShowTeamA");
  const btnB = document.getElementById("btnShowTeamB");
  const boxA = document.getElementById("teamAContainer");
  const boxB = document.getElementById("teamBContainer");

  btnA.addEventListener("click", () => {
    btnA.classList.add("active");
    btnB.classList.remove("active");
    boxA.style.display = "block";
    boxB.style.display = "none";
  });

  btnB.addEventListener("click", () => {
    btnB.classList.add("active");
    btnA.classList.remove("active");
    boxA.style.display = "none";
    boxB.style.display = "block";
  });
}

document.getElementById("printSquadsBtn").addEventListener("click", () => {
  const win = window.open("", "_blank");
  const styles = `
    <style>
      body { font-family: Arial; padding: 20px; }
      h2 { margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
      th { background: #f3f3f3; }
      .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
      .section { margin-top: 30px; }
    </style>
  `;

  const makeTable = (title, list) => {
    let html = `<div class="section"><h3>${title}</h3>`;
    html += `<table><tr><th>Name</th><th>Squad</th><th>Power</th></tr>`;
    list.forEach(p => {
      html += `<tr>
        <td>${p.name}</td>
        <td>${p.squad || ''}</td>
        <td>${p.power}</td>
      </tr>`;
    });
    html += "</table></div>";
    return html;
  };

  const html = `
    <html>
    <head>${styles}</head>
    <body>
      <div class="title">Desert Brawl – Team Sheets</div>

      ${makeTable("Team A — Main Squad", teams.A.main)}
      ${makeTable("Team A — Subs", teams.A.subs)}

      ${makeTable("Team B — Main Squad", teams.B.main)}
      ${makeTable("Team B — Subs", teams.B.subs)}

    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();

  setTimeout(() => {
    win.print();
  }, 300);
});
document.addEventListener('DOMContentLoaded', init);