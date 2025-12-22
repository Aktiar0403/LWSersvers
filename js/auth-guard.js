import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase-config.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.replace("login.html");
    return;
  }

  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists()) {
    alert("🐍 Access denied. Ask Akki for access.");
    await auth.signOut();
    location.replace("login.html");
  }
});
