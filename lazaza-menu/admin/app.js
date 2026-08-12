import {
  loginWithUsername, logout, watchAuth,
  sha256Hex, changePassword, claimSession, watchSessionLock
} from "../shared/auth.js";
import {
  getSettings, saveSettings,
  watchCategories, addCategory, updateCategory, deleteCategory,
  watchProducts, addProduct, updateProduct, deleteProduct,
  imageToDataUri, getSecurityConfig, setRecoveryCodeHash
} from "../shared/db.js";

const el = (id) => document.getElementById(id);
const MENU_URL = `${location.origin}/menu/`;

let categories = [];
let products = [];
let settingsCache = null;
let editingProductId = null;
let pendingProductImage = null;
let pendingLogoImage = null;
let pendingBannerImage = null;
let contactsDraft = [];
let unsubSessionLock = null;

/* ================= AUTH ================= */
watchAuth(async (user) => {
  if (user) {
    el("loginScreen").hidden = true;
    el("kickedScreen").hidden = true;

    const security = await getSecurityConfig();
    if (!security || !security.recoveryCodeHash) {
      el("setupBackdrop").classList.add("open");
      return; // wait for recovery code setup before showing the dashboard
    }

    el("app").hidden = false;
    boot();

    // Keep the single-session lock active even after a page refresh
    // (sessionStorage survives reload in the same tab; the Firestore
    // listener itself has to be re-attached on every page load).
    if (!unsubSessionLock) {
      unsubSessionLock = watchSessionLock(async () => {
        await logout();
        el("app").hidden = true;
        el("kickedScreen").hidden = false;
      });
    }
  } else {
    el("loginScreen").hidden = false;
    el("app").hidden = true;
    if (unsubSessionLock) { unsubSessionLock(); unsubSessionLock = null; }
  }
});

el("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("loginError").hidden = true;
  try {
    await loginWithUsername(el("loginUsername").value, el("loginPassword").value);
    await claimSession(); // takes over as the single active session, kicking any other open one
  } catch (err) {
    el("loginError").textContent = "اسم المستخدم أو كلمة المرور غير صحيحة";
    el("loginError").hidden = false;
  }
});

el("logoutBtn").addEventListener("click", () => logout());

/* ================= FIRST-RUN: recovery code setup ================= */
el("setupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("setupError").hidden = true;
  const code = el("setupCode").value.trim();
  const confirm2 = el("setupCodeConfirm").value.trim();
  if (code.length < 3) { showSetupError("الرمز قصير جدًا"); return; }
  if (code !== confirm2) { showSetupError("الرمزان غير متطابقين"); return; }

  const hash = await sha256Hex(code);
  await setRecoveryCodeHash(hash);
  el("setupBackdrop").classList.remove("open");
  el("app").hidden = false;
  boot();
});
function showSetupError(msg){ el("setupError").textContent = msg; el("setupError").hidden = false; }

/* ================= BOOT (once logged in) ================= */
let booted = false;
function boot(){
  if (booted) return;
  booted = true;
  watchCategories((cats) => { categories = cats; renderCategoryList(); refreshCategorySelects(); renderProductList(); });
  watchProducts((prods) => { products = prods; renderProductList(); });
  loadSettingsIntoForm();
  buildQr();
}

/* ================= TAB NAV ================= */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.hidden = true);
    el(`tab-${btn.dataset.tab}`).hidden = false;
  });
});

function toast(msg){
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

/* ================= CATEGORIES ================= */
function renderCategoryList(){
  const wrap = el("categoryList");
  wrap.innerHTML = "";
  const sorted = [...categories].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  sorted.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "c-row";
    row.innerHTML = `
      <input type="text" value="${escapeAttr(c.name)}" data-id="${c.id}">
      <label class="checkbox-row" style="margin:0;font-size:.75rem;">
        <input type="checkbox" class="cat-active" ${c.active !== false ? "checked" : ""}> نشط
      </label>
      <div class="order-btns">
        <button class="cat-up" ${idx===0 ? "disabled" : ""}>▲</button>
        <button class="cat-down" ${idx===sorted.length-1 ? "disabled" : ""}>▼</button>
      </div>
      <button class="icon-btn cat-del">حذف</button>
    `;
    const nameInput = row.querySelector("input[type=text]");
    nameInput.addEventListener("change", () => updateCategory(c.id, { name: nameInput.value.trim() }));
    row.querySelector(".cat-active").addEventListener("change", (e) => updateCategory(c.id, { active: e.target.checked }));
    row.querySelector(".cat-up").addEventListener("click", () => swapOrder(sorted, idx, idx - 1));
    row.querySelector(".cat-down").addEventListener("click", () => swapOrder(sorted, idx, idx + 1));
    row.querySelector(".cat-del").addEventListener("click", async () => {
      const inUse = products.some(p => p.categoryId === c.id);
      if (inUse){ alert("لا يمكن حذف قسم يحتوي على منتجات. احذف أو انقل المنتجات أولًا."); return; }
      if (confirm(`حذف قسم "${c.name}"؟`)) await deleteCategory(c.id);
    });
    wrap.appendChild(row);
  });
}

async function swapOrder(sorted, i, j){
  if (j < 0 || j >= sorted.length) return;
  const a = sorted[i], b = sorted[j];
  await Promise.all([
    updateCategory(a.id, { order: b.order ?? j }),
    updateCategory(b.id, { order: a.order ?? i })
  ]);
}

el("addCategoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el("newCategoryName").value.trim();
  if (!name) return;
  const maxOrder = categories.reduce((m,c) => Math.max(m, c.order ?? 0), 0);
  await addCategory(name, maxOrder + 1);
  el("newCategoryName").value = "";
  toast("تمت إضافة القسم");
});

function refreshCategorySelects(){
  const sorted = [...categories].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const opts = sorted.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  el("pCategory").innerHTML = opts || `<option value="">أضف قسمًا أولًا</option>`;
  const filter = el("filterCategory");
  const current = filter.value;
  filter.innerHTML = `<option value="all">كل الأقسام</option>` + opts;
  filter.value = current || "all";
}
el("filterCategory").addEventListener("change", renderProductList);

/* ================= PRODUCTS ================= */
function renderProductList(){
  const wrap = el("productList");
  wrap.innerHTML = "";
  const filterVal = el("filterCategory").value;
  const list = [...products]
    .filter(p => filterVal === "all" || p.categoryId === filterVal)
    .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

  if (list.length === 0){
    wrap.innerHTML = `<p style="color:var(--c-ink-soft);text-align:center;padding:20px;">لا توجد منتجات بعد</p>`;
    return;
  }

  list.forEach(p => {
    const cat = categories.find(c => c.id === p.categoryId);
    const row = document.createElement("div");
    row.className = "p-row";
    row.innerHTML = `
      <img src="${p.imageUrl || ''}" alt="">
      <div class="p-row__body">
        <p class="p-row__name">${escapeHtml(p.name)}</p>
        <p class="p-row__meta">
          <span class="p-row__tag">${cat ? escapeHtml(cat.name) : "بدون قسم"}</span>
          <span class="p-row__tag">${p.hasDiscount ? p.discountPrice : p.price} ج.م</span>
          ${p.available === false ? `<span class="p-row__tag off">غير متاح</span>` : ""}
          ${p.hidden ? `<span class="p-row__tag off">مخفي</span>` : ""}
        </p>
      </div>
      <div class="p-row__actions">
        <button class="icon-btn edit-btn">تعديل</button>
      </div>
    `;
    row.querySelector(".edit-btn").addEventListener("click", () => openProductModal(p));
    wrap.appendChild(row);
  });
}

el("addProductBtn").addEventListener("click", () => openProductModal(null));

function openProductModal(p){
  editingProductId = p ? p.id : null;
  pendingProductImage = null;
  el("productModalTitle").textContent = p ? "تعديل منتج" : "إضافة منتج";
  el("deleteProductBtn").hidden = !p;

  refreshCategorySelects();
  el("pCategory").value = p?.categoryId || "";
  el("pName").value = p?.name || "";
  el("pDesc").value = p?.description || "";
  el("pIngredients").value = p?.ingredients || "";
  el("pNotes").value = p?.notes || "";
  el("pPrice").value = p?.price ?? "";
  el("pHasDiscount").checked = !!p?.hasDiscount;
  el("pDiscountPrice").value = p?.discountPrice ?? "";
  el("discountRow").hidden = !p?.hasDiscount;
  el("pAvailable").value = String(p?.available !== false);
  el("pHidden").checked = !!p?.hidden;

  document.querySelectorAll(".pBadge").forEach(cb => { cb.checked = (p?.badges || []).includes(cb.value); });

  const preview = el("productImgPreview");
  if (p?.imageUrl){ preview.src = p.imageUrl; preview.hidden = false; } else { preview.hidden = true; }

  el("productModalBackdrop").classList.add("open");
}
el("productModalClose").addEventListener("click", closeProductModal);
function closeProductModal(){ el("productModalBackdrop").classList.remove("open"); }

el("pHasDiscount").addEventListener("change", (e) => { el("discountRow").hidden = !e.target.checked; });

setupImagePicker("productImgPicker", "productImgInput", "productImgPreview", (file) => { pendingProductImage = file; });
setupImagePicker("logoPicker", "logoInput", "logoPreview", (file) => { pendingLogoImage = file; });
setupImagePicker("bannerPicker", "bannerInput", "bannerPreview", (file) => { pendingBannerImage = file; });

function setupImagePicker(pickerId, inputId, previewId, onPick){
  const picker = el(pickerId), input = el(inputId), preview = el(previewId);
  picker.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    onPick(file);
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; preview.hidden = false; };
    reader.readAsDataURL(file);
  });
}

el("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.submitter;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const existing = editingProductId ? products.find(p => p.id === editingProductId) : null;
    let imageUrl = existing?.imageUrl || "";
    if (pendingProductImage) imageUrl = await imageToDataUri(pendingProductImage);

    const badges = Array.from(document.querySelectorAll(".pBadge:checked")).map(cb => cb.value);

    const data = {
      categoryId: el("pCategory").value,
      name: el("pName").value.trim(),
      description: el("pDesc").value.trim(),
      ingredients: el("pIngredients").value.trim(),
      notes: el("pNotes").value.trim(),
      price: Number(el("pPrice").value),
      hasDiscount: el("pHasDiscount").checked,
      discountPrice: el("pHasDiscount").checked ? Number(el("pDiscountPrice").value) : null,
      available: el("pAvailable").value === "true",
      hidden: el("pHidden").checked,
      badges,
      imageUrl,
      order: existing?.order ?? (products.filter(p => p.categoryId === el("pCategory").value).length + 1)
    };

    if (editingProductId) await updateProduct(editingProductId, data);
    else await addProduct(data);

    toast("تم الحفظ بنجاح");
    closeProductModal();
  } catch (err){
    alert("حدث خطأ أثناء الحفظ: " + err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

el("deleteProductBtn").addEventListener("click", async () => {
  if (!editingProductId) return;
  if (!confirm("هل تريد حذف هذا المنتج نهائيًا؟")) return;
  await deleteProduct(editingProductId);
  toast("تم الحذف");
  closeProductModal();
});

/* ================= RESTAURANT INFO ================= */
async function loadSettingsIntoForm(){
  const s = await getSettings();
  settingsCache = s;
  el("infName").value = s.name || "";
  el("infDesc").value = s.description || "";
  el("infAddress").value = s.address || "";
  el("infShowAddress").checked = s.showAddress !== false;
  el("infMaps").value = s.mapsUrl || "";
  el("infHours").value = s.hours || "";
  el("infPrimaryColor").value = s.primaryColor || "#0E4F5C";
  el("infAccentColor").value = s.accentColor || "#C9A15A";

  if (s.logoUrl){ el("logoPreview").src = s.logoUrl; el("logoPreview").hidden = false; }
  if (s.bannerUrl){ el("bannerPreview").src = s.bannerUrl; el("bannerPreview").hidden = false; }

  contactsDraft = Array.isArray(s.contacts) ? [...s.contacts] : [];
  renderContactList();
}

const CONTACT_TYPES = {
  phone: "📞 هاتف", whatsapp: "💬 واتساب", facebook: "فيسبوك", instagram: "إنستجرام", other: "آخر"
};

function renderContactList(){
  const wrap = el("contactList");
  wrap.innerHTML = "";
  contactsDraft.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "contact-row";
    row.innerHTML = `
      <select class="c-type">${Object.entries(CONTACT_TYPES).map(([v,l]) => `<option value="${v}" ${c.type===v?"selected":""}>${l}</option>`).join("")}</select>
      <input type="text" class="c-value" placeholder="القيمة (رقم أو رابط)" value="${escapeAttr(c.value || "")}">
      <input type="checkbox" class="contact-visible" ${c.visible !== false ? "checked" : ""} title="إظهار في المنيو">
      <button type="button" class="contact-del">✕</button>
    `;
    row.querySelector(".c-type").addEventListener("change", (e) => contactsDraft[idx].type = e.target.value);
    row.querySelector(".c-value").addEventListener("input", (e) => contactsDraft[idx].value = e.target.value);
    row.querySelector(".contact-visible").addEventListener("change", (e) => contactsDraft[idx].visible = e.target.checked);
    row.querySelector(".contact-del").addEventListener("click", () => { contactsDraft.splice(idx,1); renderContactList(); });
    wrap.appendChild(row);
  });
}

el("addContactBtn").addEventListener("click", () => {
  contactsDraft.push({ id: crypto.randomUUID(), type: "phone", value: "", visible: true });
  renderContactList();
});

el("infoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    let logoUrl = settingsCache?.logoUrl || "";
    let bannerUrl = settingsCache?.bannerUrl || "";
    if (pendingLogoImage) logoUrl = await imageToDataUri(pendingLogoImage, 300, 0.8);
    if (pendingBannerImage) bannerUrl = await imageToDataUri(pendingBannerImage, 1000, 0.65);

    await saveSettings({
      name: el("infName").value.trim(),
      description: el("infDesc").value.trim(),
      logoUrl, bannerUrl,
      address: el("infAddress").value.trim(),
      showAddress: el("infShowAddress").checked,
      mapsUrl: el("infMaps").value.trim(),
      hours: el("infHours").value.trim(),
      primaryColor: el("infPrimaryColor").value,
      accentColor: el("infAccentColor").value,
      contacts: contactsDraft.filter(c => c.value && c.value.trim())
    });

    pendingLogoImage = null; pendingBannerImage = null;
    el("infoSaveMsg").hidden = false;
    setTimeout(() => el("infoSaveMsg").hidden = true, 2500);
    toast("تم حفظ بيانات المطعم");
    settingsCache = await getSettings();
    buildQr();
  } catch (err){
    alert("حدث خطأ أثناء الحفظ: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ================= SECURITY: change password ================= */
el("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("secError").hidden = true;
  const current = el("secCurrentPassword").value;
  const next = el("secNewPassword").value;
  const confirmNext = el("secNewPasswordConfirm").value;
  const code = el("secRecoveryCode").value.trim();

  if (next !== confirmNext) return showSecError("كلمتا المرور الجديدتان غير متطابقتين");
  if (next.length < 6) return showSecError("كلمة المرور الجديدة قصيرة جدًا (6 أحرف على الأقل)");

  const btn = e.submitter;
  btn.disabled = true;
  try {
    const security = await getSecurityConfig();
    const codeHash = await sha256Hex(code);
    if (!security || codeHash !== security.recoveryCodeHash) {
      showSecError("الرمز السري غير صحيح");
      return;
    }
    await changePassword(current, next);
    el("passwordForm").reset();
    el("secSaveMsg").hidden = false;
    setTimeout(() => el("secSaveMsg").hidden = true, 3000);
    toast("تم تغيير كلمة المرور بنجاح");
  } catch (err) {
    showSecError("تعذر تغيير كلمة المرور: تأكد من كلمة المرور الحالية");
  } finally {
    btn.disabled = false;
  }
});
function showSecError(msg){ el("secError").textContent = msg; el("secError").hidden = false; }

/* ================= QR CODE (styled canvas, high scan reliability) ================= */
function buildQr(){
  const holder = document.createElement("div");
  new QRCode(holder, {
    text: MENU_URL,
    width: 720, height: 720,
    colorDark: "#082E37",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H // high correction: keeps scanning reliable even with a logo overlay
  });

  setTimeout(() => {
    const qrImgEl = holder.querySelector("img") || holder.querySelector("canvas");
    const qrSrc = qrImgEl.tagName === "CANVAS" ? qrImgEl.toDataURL("image/png") : qrImgEl.src;
    drawQrCard(qrSrc);
  }, 60);
}

function drawQrCard(qrSrc){
  const canvas = el("qrCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const primary = settingsCache?.primaryColor || "#0E4F5C";
  const accent = settingsCache?.accentColor || "#C9A15A";

  // Card background
  ctx.clearRect(0,0,W,H);
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  roundRect(ctx, 4, 4, W-8, H-8, 20);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = primary;
  ctx.font = "bold 22px Cairo, sans-serif";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(settingsCache?.name || "امسح لعرض المنيو", W/2, 40);

  const qrImg = new Image();
  qrImg.onload = () => {
    const qrSize = 240;
    const qrX = (W - qrSize) / 2, qrY = 56;
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    const finish = () => {
      ctx.fillStyle = "#55655F";
      ctx.font = "600 14px Cairo, sans-serif";
      ctx.fillText("امسح الكود لعرض المنيو مباشرة", W/2, qrY + qrSize + 32);
      el("qrUrlText").textContent = MENU_URL;
    };

    if (settingsCache?.logoUrl){
      const logo = new Image();
      logo.onload = () => {
        const logoSize = 52;
        const lx = (W - logoSize)/2, ly = qrY + (qrSize - logoSize)/2;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(W/2, ly + logoSize/2, logoSize/2 + 6, 0, Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(W/2, ly + logoSize/2, logoSize/2, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(logo, lx, ly, logoSize, logoSize);
        ctx.restore();
        finish();
      };
      logo.onerror = finish;
      logo.src = settingsCache.logoUrl;
    } else {
      finish();
    }
  };
  qrImg.src = qrSrc;
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

el("qrDownloadBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "menu-qr-code.png";
  link.href = el("qrCanvas").toDataURL("image/png");
  link.click();
});

el("qrPrintBtn").addEventListener("click", () => {
  const src = el("qrCanvas").toDataURL("image/png");
  const w = window.open("", "_blank");
  w.document.write(`
    <html dir="rtl"><head><title>طباعة QR Code</title></head>
    <body style="text-align:center;font-family:sans-serif;padding:40px;">
      <img src="${src}" style="width:320px;">
      <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  w.document.close();
});

el("qrCopyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(MENU_URL);
  toast("تم نسخ الرابط");
});

/* ================= Helpers ================= */
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, "&quot;"); }
