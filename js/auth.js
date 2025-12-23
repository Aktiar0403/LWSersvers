// ============================
// AUTH.JS — ADMIN ONLY LOGIN
// ============================

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth } from "./firebase-config.js";


// ============================
// ADMIN LOGIN (EMAIL / PASSWORD)
// ============================
export async function loginAdmin(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


// ============================
// LOGOUT ADMIN
// ============================
export function logout() {
  return signOut(auth);
}


// ============================
// GUARD FOR ADMIN PAGE ONLY
// ============================
// If not logged in → send to admin-login page
export function guardAdminPage() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "admin-login.html";
    }
  });
}
// ============================
// CHECK IF CURRENT USER IS ADMIN
// ============================
export async function checkIsAdmin() {
  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdTokenResult();
  return token.claims.admin === true;
}
