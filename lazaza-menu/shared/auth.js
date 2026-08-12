// shared/auth.js
// Wraps Firebase Auth so the rest of the app only ever deals with a
// "username" (never an email) and adds a single-active-session lock.
import { auth, usernameToEmail } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { setActiveSession, watchActiveSession } from "./db.js";

export function loginWithUsername(username, password) {
  return signInWithEmailAndPassword(auth, usernameToEmail(username), password);
}

export function logout() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** SHA-256 hash (hex) using the browser's built-in Web Crypto API. */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Re-authenticate with the current password, then change to a new one.
 * Required before Firebase allows updatePassword on an existing session.
 */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("لازم تكون مسجل دخول");
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/* ---------------- Single active session lock ----------------
   On every successful login we write a fresh random sessionId to Firestore.
   Every open admin tab/device listens for changes; if the stored sessionId
   ever stops matching its own, that session is force-logged-out. This means
   logging in from a new device immediately kicks any other open session. */

const LOCAL_KEY = "lazaza_admin_session_id";

export async function claimSession() {
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(LOCAL_KEY, sessionId);
  await setActiveSession(sessionId);
  return sessionId;
}

export function watchSessionLock(onKicked) {
  return watchActiveSession((data) => {
    const mine = sessionStorage.getItem(LOCAL_KEY);
    if (!mine) return; // this tab never claimed a session (e.g. not logged in yet)
    if (data && data.sessionId !== mine) {
      onKicked();
    }
  });
}
