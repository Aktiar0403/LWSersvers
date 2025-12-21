// js/audit.js
import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function logAudit(action, memberName, details, adminName) {
  await addDoc(collection(db, 'audit'), {
    action,
    memberName: memberName || '',
    details: details || '',
    adminName: adminName || '',
    timestamp: serverTimestamp()
  });
}

export function subscribeAudit(listEl) {
  const qRef = query(collection(db, 'audit'), orderBy('timestamp', 'desc'));

  onSnapshot(qRef, (snap) => {
    listEl.innerHTML = '';

    if (snap.empty) {
      listEl.innerHTML = '<div class="muted xsmall">No changes yet.</div>';
      return;
    }

    // 🔥 LIMIT TO MOST RECENT 10 AUDIT ENTRIES
    const limited = snap.docs.slice(0, 10);

    limited.forEach(docSnap => {
      const d = docSnap.data();

      const div = document.createElement('div');
      div.className = 'audit-item';

      const time = d.timestamp?.toDate
        ? d.timestamp.toDate().toLocaleString()
        : '';

      div.innerHTML = `
        <div>
          <strong>${d.action}</strong> – ${d.memberName || '-'} 
          ${d.details ? '— ' + d.details : ''}
        </div>
        <div class="muted xsmall">${time} • ${d.adminName || ''}</div>
      `;

      listEl.appendChild(div);
    });
  });
}
