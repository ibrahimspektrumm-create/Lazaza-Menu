// shared/firebase-config.js
// Central Firebase initialization used by both /menu and /admin.
// NOTE: Firebase Storage is intentionally NOT used in this project.
// Product/restaurant images are compressed client-side and stored as
// base64 data URIs directly inside Firestore documents instead.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3vSLumL-1Gl1nMJMKGHvG-DQietYa4pw",
  authDomain: "lazaza-menu.firebaseapp.com",
  projectId: "lazaza-menu",
  storageBucket: "lazaza-menu.firebasestorage.app",
  messagingSenderId: "851294956785",
  appId: "1:851294956785:web:e195d6576ae775672b4d50",
  measurementId: "G-30EEWG2QFH"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Internal-only: the single admin account is a "username" from the user's
// point of view, mapped to a synthetic Firebase Auth email under the hood.
export const ADMIN_EMAIL_DOMAIN = "lazaza-admin.local";
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`;
}
