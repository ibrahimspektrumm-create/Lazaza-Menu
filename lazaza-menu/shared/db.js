// shared/db.js
// Thin data-access layer over Firestore only (no Firebase Storage).
// Collections:
//   settings/restaurant     -> restaurant info, design & dynamic contact list
//   categories/{id}         -> { name, order, active }
//   products/{id}           -> { name, description, ingredients, notes, price,
//                                hasDiscount, discountPrice, categoryId, order,
//                                available, hidden, badges:[], imageUrl (base64), createdAt, updatedAt }
//   adminSecurity/config    -> { recoveryCodeHash } (set once from the admin panel, never in code)
//   adminSession/current    -> { sessionId, loggedInAt } used to enforce a single active session

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ---------------- Restaurant settings ---------------- */

const SETTINGS_REF = doc(db, "settings", "restaurant");

export const DEFAULT_SETTINGS = {
  name: "اسم المطعم",
  description: "أفضل الأسماك والمأكولات البحرية الطازجة",
  logoUrl: "",
  bannerUrl: "",
  address: "",
  showAddress: true,
  mapsUrl: "",
  hours: "",
  primaryColor: "#0E4F5C",
  accentColor: "#C9A15A",
  contacts: [] // [{ id, type: 'phone'|'whatsapp'|'facebook'|'instagram'|'other', label, value, visible }]
};

export async function getSettings() {
  const snap = await getDoc(SETTINGS_REF);
  if (!snap.exists()) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

export function watchSettings(callback) {
  return onSnapshot(SETTINGS_REF, (snap) => {
    callback(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS });
  });
}

export async function saveSettings(data) {
  await setDoc(SETTINGS_REF, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------------- Categories ---------------- */

const categoriesCol = collection(db, "categories");

export function watchCategories(callback) {
  const q = query(categoriesCol, orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addCategory(name, order) {
  return addDoc(categoriesCol, { name, order, active: true, createdAt: serverTimestamp() });
}

export async function updateCategory(id, data) {
  return updateDoc(doc(db, "categories", id), data);
}

export async function deleteCategory(id) {
  return deleteDoc(doc(db, "categories", id));
}

/* ---------------- Products ---------------- */

const productsCol = collection(db, "products");

export function watchProducts(callback) {
  const q = query(productsCol, orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addProduct(data) {
  return addDoc(productsCol, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateProduct(id, data) {
  return updateDoc(doc(db, "products", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProduct(id) {
  return deleteDoc(doc(db, "products", id));
}

/* ---------------- Image compression -> base64 (no Storage) ---------------- */

/**
 * Resize + compress an image file in the browser and return a base64 data URI.
 * Kept small (max ~700px wide, medium quality) so it stays well under
 * Firestore's 1MB per-document limit even with a couple of images per doc.
 */
export function imageToDataUri(file, maxWidth = 700, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- Admin security (recovery code + session lock) ---------------- */

const SECURITY_REF = doc(db, "adminSecurity", "config");
const SESSION_REF = doc(db, "adminSession", "current");

export async function getSecurityConfig() {
  const snap = await getDoc(SECURITY_REF);
  return snap.exists() ? snap.data() : null;
}

export async function setRecoveryCodeHash(hash) {
  return setDoc(SECURITY_REF, { recoveryCodeHash: hash, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setActiveSession(sessionId) {
  return setDoc(SESSION_REF, { sessionId, loggedInAt: serverTimestamp() });
}

export function watchActiveSession(callback) {
  return onSnapshot(SESSION_REF, (snap) => callback(snap.exists() ? snap.data() : null));
}
