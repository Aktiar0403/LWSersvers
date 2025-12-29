
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-uErhH24CjyrHOErTSuAv9XRFsJuW3-c",
  authDomain: "kobras-82709.firebaseapp.com",
  projectId: "kobras-82709",
  storageBucket: "kobras-82709.firebasestorage.app",
  messagingSenderId: "708375882434",
  appId: "1:708375882434:web:620620259ef0bd648e695b",
  measurementId: "G-50JBLNGR3M"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);