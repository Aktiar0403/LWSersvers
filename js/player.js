// player.js (Public Mode – No Authentication)

import { db } from './firebase-config.js';
import { renderCards } from './cards.js';
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const state = {
  members: [],
  filter: 'RESET',
  search: '',
  sort: 'none'
};

const dom = {
  grid: document.getElementById('cardsGrid'),
  statTotal: document.getElementById('statTotal'),
  statAvg: document.getElementById('statAvg'),
  statFive: document.getElementById('statFive'),
  searchInput: document.getElementById('searchInput'),
  filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
  sortButtons: Array.from(document.querySelectorAll('.sort-btn'))
};

// ------------------ FILTER + SORT ------------------

function filteredAndSortedMembers() {
  let arr = state.members.slice();

  if (state.filter !== 'RESET') {
    const f = state.filter.toUpperCase();
    arr = arr.filter(m =>
      ((m.squad || '') + (m.role || '')).toUpperCase().includes(f)
    );
  }

  const q = state.search.toLowerCase();
  if (q) {
    arr = arr.filter(m =>
      (m.name + ' ' + (m.role || '') + ' ' + (m.squad || '')).toLowerCase().includes(q)
    );
  }

  if (state.sort === 'power-desc') {
    arr.sort((a, b) => (b.power || 0) - (a.power || 0));
  } else if (state.sort === 'power-asc') {
    arr.sort((a, b) => (a.power || 0) - (b.power || 0));
  } else if (state.sort === 'stars-desc') {
    arr.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  } else if (state.sort === 'stars-asc') {
    arr.sort((a, b) => (a.stars || 0) - (b.stars || 0));
  }

  return arr;
}

// ------------------ HEADER STATS ------------------

function updateStats(view) {
  const total = view.length;
  let sum = 0;
  let five = 0;

  view.forEach(m => {
    if (m.power) sum += m.power;
    if (m.stars === 5) five++;
  });

  dom.statTotal.textContent = total;
  dom.statAvg.textContent = total ? (sum / total).toFixed(2) : '0.00';
  dom.statFive.textContent = five;
}

// ------------------ RENDER ------------------

function render() {
  const view = filteredAndSortedMembers();
  renderCards(dom.grid, view, { showAdminActions: false });
  updateStats(view);
}

// ------------------ UI EVENTS ------------------

function attachEvents() {
  dom.searchInput?.addEventListener('input', () => {
    state.search = dom.searchInput.value;
    render();
  });

  dom.filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || 'RESET';
      render();
    });
  });

  dom.sortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort || 'none';
      render();
    });
  });
}

// ------------------ FIRESTORE ------------------

function subscribeMembers() {
  const qRef = query(collection(db, 'members'), orderBy('name'));
  onSnapshot(qRef, (snap) => {
    state.members = [];
    snap.forEach(docSnap => {
      state.members.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    render();
  });
}

// ------------------ INIT ------------------

attachEvents();
subscribeMembers();

console.log("Player page loaded in PUBLIC MODE (no login).");
