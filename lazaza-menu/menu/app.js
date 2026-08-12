import { watchSettings, watchCategories, watchProducts } from "../shared/db.js";

let categories = [];
let products = [];
let settingsData = null;
let activeCategory = "all";

const el = (id) => document.getElementById(id);

/* ---------- Settings / hero / footer / SEO ---------- */
watchSettings((s) => {
  settingsData = s;
  applySettings(s);
});

function applySettings(s){
  el("restName").textContent = s.name;
  el("restDesc").textContent = s.description || "";
  document.documentElement.style.setProperty("--c-primary", s.primaryColor || "#0E4F5C");
  document.documentElement.style.setProperty("--c-accent", s.accentColor || "#C9A15A");

  if (s.bannerUrl) el("bannerImg").src = s.bannerUrl;
  if (s.logoUrl) { el("logoImg").src = s.logoUrl; el("logoImg").hidden = false; }

  // SEO
  document.title = s.name;
  el("pageTitle").textContent = s.name;
  el("metaDesc").setAttribute("content", s.description || "");
  el("ogTitle").setAttribute("content", s.name);
  el("ogDesc").setAttribute("content", s.description || "");
  if (s.logoUrl){ el("ogImage").setAttribute("content", s.logoUrl); el("favicon").setAttribute("href", s.logoUrl); }

  // Footer
  el("footerHours").textContent = s.hours ? `⏰ ${s.hours}` : "";
  const contactBits = (s.contacts || [])
    .filter(c => c.visible !== false && c.value)
    .map(c => contactLinkHTML(c));
  el("footerContact").innerHTML = contactBits.join(" | ");
  if (s.showAddress && s.address) el("footerHours").innerHTML += `<br>📍 ${s.address}`;

  const mapsBtn = el("footerMaps");
  if (s.mapsUrl){ mapsBtn.href = s.mapsUrl; mapsBtn.hidden = false; } else { mapsBtn.hidden = true; }

  maybeHideLoading();
}

function contactLinkHTML(c){
  switch (c.type) {
    case "phone": return `<a href="tel:${c.value}">📞 ${escapeHtml(c.value)}</a>`;
    case "whatsapp": return `<a href="https://wa.me/${c.value.replace(/\D/g,'')}" target="_blank" rel="noopener">💬 واتساب</a>`;
    case "facebook": return `<a href="${c.value}" target="_blank" rel="noopener">فيسبوك</a>`;
    case "instagram": return `<a href="${c.value}" target="_blank" rel="noopener">إنستجرام</a>`;
    default: return `<a href="${c.value}" target="_blank" rel="noopener">${escapeHtml(c.value)}</a>`;
  }
}

/* ---------- Categories & products (realtime) ---------- */
let catLoaded = false, prodLoaded = false;

watchCategories((cats) => {
  categories = cats.filter(c => c.active !== false);
  catLoaded = true;
  renderTabs();
  renderMenu();
  maybeHideLoading();
});

watchProducts((prods) => {
  products = prods.filter(p => !p.hidden);
  prodLoaded = true;
  renderMenu();
  maybeHideLoading();
});

function maybeHideLoading(){
  if (settingsData && catLoaded && prodLoaded){
    el("loadingScreen").classList.add("hide");
  }
}

function renderTabs(){
  const wrap = el("tabsScroll");
  wrap.innerHTML = "";
  const allBtn = tabButton("all", "الكل");
  wrap.appendChild(allBtn);
  categories.forEach(c => wrap.appendChild(tabButton(c.id, c.name)));
}

function tabButton(id, label){
  const btn = document.createElement("button");
  btn.className = "tab-btn" + (activeCategory === id ? " active" : "");
  btn.textContent = label;
  btn.addEventListener("click", () => {
    activeCategory = id;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderMenu();
  });
  return btn;
}

function renderMenu(){
  if (!catLoaded || !prodLoaded) return;
  const list = el("menuList");
  list.innerHTML = "";

  const cats = activeCategory === "all"
    ? categories
    : categories.filter(c => c.id === activeCategory);

  let anyShown = false;

  cats.forEach(cat => {
    const items = products
      .filter(p => p.categoryId === cat.id)
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (items.length === 0) return;
    anyShown = true;

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = cat.name;
    list.appendChild(title);

    items.forEach(p => list.appendChild(productCard(p)));
  });

  el("emptyState").hidden = anyShown;
}

function productCard(p){
  const card = document.createElement("div");
  card.className = "card" + (p.available === false ? " unavailable" : "");
  card.addEventListener("click", () => openSheet(p));

  const badges = badgeHTML(p);
  const priceHTML = priceBlockHTML(p);

  card.innerHTML = `
    <div class="card__imgwrap">
      <img src="${p.imageUrl || ''}" alt="${escapeHtml(p.name)}" loading="lazy">
      <div class="badges">${badges}</div>
    </div>
    <div class="card__body">
      <div class="card__top">
        <p class="card__name">${escapeHtml(p.name)}</p>
      </div>
      <p class="card__desc">${escapeHtml(p.description || "")}</p>
      <div class="card__bottom">${priceHTML}</div>
    </div>
  `;
  return card;
}

function badgeHTML(p){
  const b = [];
  if (p.hasDiscount) b.push(`<span class="badge badge--discount">خصم</span>`);
  (p.badges || []).forEach(tag => {
    if (tag === "popular") b.push(`<span class="badge badge--popular">الأكثر طلبًا</span>`);
    if (tag === "new") b.push(`<span class="badge badge--new">جديد</span>`);
    if (tag === "featured") b.push(`<span class="badge badge--featured">مميز</span>`);
  });
  return b.join("");
}

function priceBlockHTML(p){
  if (p.hasDiscount && p.discountPrice){
    return `<span class="price"><span class="price__old">${p.price}</span><span class="price__new">${p.discountPrice} ج.م</span></span>`;
  }
  return `<span class="price">${p.price} ج.م</span>`;
}

/* ---------- Product detail sheet ---------- */
function openSheet(p){
  el("sheetImg").src = p.imageUrl || "";
  el("sheetName").textContent = p.name;
  el("sheetDesc").textContent = p.description || "";
  el("sheetIngredients").hidden = !p.ingredients;
  el("sheetIngredients").textContent = p.ingredients || "";
  el("sheetNotes").hidden = !p.notes;
  el("sheetNotes").textContent = p.notes || "";
  el("sheetBadges").innerHTML = badgeHTML(p);
  el("sheetPrice").innerHTML = priceBlockHTML(p);
  el("sheetBackdrop").classList.add("open");
}
el("sheetClose").addEventListener("click", closeSheet);
el("sheetBackdrop").addEventListener("click", (e) => { if (e.target.id === "sheetBackdrop") closeSheet(); });
function closeSheet(){ el("sheetBackdrop").classList.remove("open"); }

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

// Fallback: hide loading screen after 4s regardless (e.g. empty new project)
setTimeout(() => el("loadingScreen").classList.add("hide"), 4000);
