/* ─────────────────────────────────────────────────────────────
   SHOP SETTINGS — edit these if your number or address changes.
   ───────────────────────────────────────────────────────────── */
const SETTINGS = {
  whatsapp: "250791449915", // country code + number, no "+" or spaces
  whatsappDisplay: "+250 791 449 915",
  address: "Remera Kisimenti, behind Ecobank, KG 18, Kigali, Rwanda",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Ecobank+Remera+Kisimenti+KG+18+Kigali",
  // Order of the category buttons. Categories not listed here appear at the end.
  categories: ["Shirts", "T-Shirts", "Polos & Knits", "Tanks", "Hoodies & Jackets", "Bottoms", "Boxers", "Accessories"],
};
/* ───────────────────────────────────────────────────────────── */

(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const main = $("#main");
  const IMG = "images/";
  const CART_KEY = "ths-cart";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let PRODUCTS = [];
  let CATS = [];

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const slug = (s) =>
    String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const list = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);
  const fmt = (n) => n.toLocaleString("en-US") + " FRW";
  const priceText = (p) => (p.price == null ? "Price on request" : fmt(p.price));

  /* ── Load products.yml ─────────────────────────────────── */

  function parsePrice(v) {
    if (typeof v === "number" && isFinite(v)) return Math.round(v);
    const digits = String(v ?? "").replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : null; // "TBD" or empty → price on request
  }

  function isTrue(v) {
    return v === true || /^(true|yes|y|1)$/i.test(String(v ?? "").trim());
  }

  function normalize(raw) {
    if (!Array.isArray(raw)) throw new Error("The file should be a list of products, each starting with \"- name:\".");
    const seen = {};
    return raw
      .filter((r) => r && typeof r === "object" && r.name)
      .map((r, i) => {
        const colors = list(r.colors ?? r.color);
        const images = list(r.images);
        const main = r.image ? String(r.image) : images[0] || "";
        let id = slug(r.name) || "item-" + (i + 1);
        seen[id] = (seen[id] || 0) + 1;
        if (seen[id] > 1) id += "-" + seen[id];
        return {
          id,
          name: String(r.name).trim(),
          category: String(r.category || "Other").trim(),
          price: parsePrice(r.price),
          colors,
          // photo for each colour (same order as colors); falls back to the main photo
          colorImages: colors.map((_, k) => images[k] || null),
          image: main,
          gallery: list(r.gallery),
          sizes: list(r.sizes),
          description: r.description ? String(r.description) : "",
          soldOut: isTrue(r.sold_out),
        };
      });
  }

  async function load() {
    let text;
    try {
      const res = await fetch("products.yml", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      text = await res.text();
    } catch (e) {
      return showError("Could not load products.yml (" + e.message + "). Check your internet connection and refresh.");
    }
    try {
      PRODUCTS = normalize(jsyaml.load(text));
    } catch (e) {
      const line = e.mark ? " around line " + (e.mark.line + 1) : "";
      return showError(
        "There is a mistake in products.yml" + line + ".",
        (e.reason || e.message) + (e.mark && e.mark.snippet ? "\n\n" + e.mark.snippet : ""),
      );
    }
    const present = [...new Set(PRODUCTS.map((p) => p.category))];
    CATS = [...SETTINGS.categories.filter((c) => present.includes(c)), ...present.filter((c) => !SETTINGS.categories.includes(c))];
    renderMenu();
    renderFooter();
    cart.prune();
    updateCartBadge();
    route();
  }

  function showError(title, detail) {
    main.innerHTML = `<div class="error"><h1>Something needs fixing</h1><p>${esc(title)}</p>${
      detail ? `<pre>${esc(detail)}</pre>` : ""
    }<p class="muted">Open products.yml on github.com, fix the line, and commit. See README.md for examples.</p></div>`;
  }

  /* ── Routing (#/, #/c/slug, #/p/id, #/search?q=) ───────── */

  function route() {
    const h = decodeURIComponent(location.hash.slice(1) || "/");
    const [path, query = ""] = h.split("?");
    const parts = path.split("/").filter(Boolean);
    closePanels();
    if (parts[0] === "p" && parts[1]) return viewProduct(parts[1]);
    if (parts[0] === "c" && parts[1]) return viewCategory(parts[1]);
    if (parts[0] === "search") return viewSearch(new URLSearchParams(query).get("q") || "");
    return viewList("All", PRODUCTS);
  }

  function setTitle(t) {
    document.title = (t ? t + " — " : "") + "Trap House Society";
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ── List views ────────────────────────────────────────── */

  function chips(active) {
    const all = ["All", ...CATS];
    return `<nav class="chips" aria-label="Filter by category">${all
      .map((c) => {
        const on = c === active;
        const href = c === "All" ? "#/" : "#/c/" + slug(c);
        return `<a class="chip${on ? " on" : ""}" href="${href}"${on ? ' aria-current="page"' : ""}>${esc(c)}</a>`;
      })
      .join("")}</nav>`;
  }

  function card(p, i) {
    const n = p.colors.length;
    return `<article class="card reveal${p.soldOut ? " sold" : ""}" style="--d:${(i % 4) * 50}ms">
      <a href="#/p/${p.id}" class="card-link">
        <div class="card-img">
          ${img(p.image, p.name, i < 4 ? "eager" : "lazy")}
          ${p.soldOut ? '<span class="sold-badge">Sold out</span>' : ""}
        </div>
        <h2 class="card-name">${esc(p.name)}</h2>
        <p class="card-price">${p.soldOut ? '<span class="sr-only">Sold out. </span>' : ""}<span class="price">${esc(priceText(p))}</span></p>
        ${n > 1 ? `<p class="card-colors">${n} colours</p>` : ""}
      </a>
    </article>`;
  }

  function img(file, alt, loading = "lazy") {
    return `<img src="${esc(IMG + file)}" alt="${esc(alt)}" loading="${loading}" decoding="async" onerror="this.onerror=null;this.classList.add('missing');this.removeAttribute('src')">`;
  }

  function grid(items, empty) {
    if (!items.length) return empty;
    return `<div class="grid">${items.map(card).join("")}</div>`;
  }

  function viewList(cat, items, heading) {
    setTitle(cat === "All" ? "" : cat);
    main.innerHTML = `
      <h1 class="page-title">${esc(heading || (cat === "All" ? "Shop all" : cat))} <span class="count">${items.length}</span></h1>
      ${chips(cat)}
      ${grid(
        items,
        `<div class="empty"><p>Nothing here yet.</p><a class="btn btn-outline" href="#/">Shop all</a></div>`,
      )}`;
    reveal();
    scrollTop();
  }

  function viewCategory(s) {
    const cat = CATS.find((c) => slug(c) === s);
    if (!cat) return notFound();
    viewList(cat, PRODUCTS.filter((p) => p.category === cat));
  }

  function viewSearch(q) {
    const s = q.trim().toLowerCase();
    const items = s
      ? PRODUCTS.filter((p) => [p.name, p.category, ...p.colors].join(" ").toLowerCase().includes(s))
      : PRODUCTS;
    setTitle("Search");
    main.innerHTML = `
      <form class="search search-inline" id="page-search" role="search">
        <label for="page-q" class="sr-only">Search products</label>
        <input id="page-q" name="q" type="search" placeholder="Search" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
        <button type="submit" aria-label="Search"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="2"/></svg></button>
      </form>
      <h1 class="page-title">${s ? `Results for “${esc(q)}”` : "All products"} <span class="count">${items.length}</span></h1>
      ${chips(null)}
      ${grid(items, `<div class="empty"><p>No products match “${esc(q)}”.</p><a class="btn btn-outline" href="#/">Shop all</a></div>`)}`;
    $("#page-search").addEventListener("submit", onSearch);
    reveal();
  }

  function notFound() {
    setTitle("Not found");
    main.innerHTML = `<div class="empty"><h1 class="page-title">Not found</h1><p>This product may have been removed.</p><a class="btn" href="#/">Shop all</a></div>`;
    scrollTop();
  }

  // Fade cards up as they scroll into view
  function reveal() {
    const cards = $$(".reveal", main);
    if (reduceMotion || !("IntersectionObserver" in window)) return cards.forEach((c) => c.classList.add("in"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    cards.forEach((c) => io.observe(c));
  }

  /* ── Product page ──────────────────────────────────────── */

  function viewProduct(id) {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) return notFound();
    setTitle(p.name);

    const state = { color: 0, size: p.sizes.length === 1 ? p.sizes[0] : null };
    const hasColorPhotos = p.colorImages.some(Boolean);
    const slides = () => {
      const first = (hasColorPhotos && p.colorImages[state.color]) || p.image;
      return [first, ...p.gallery];
    };

    const swatch = (c, k) => {
      const thumb = p.colorImages[k];
      return `<button type="button" class="swatch${thumb ? " has-thumb" : ""}" data-color="${k}" aria-pressed="${k === state.color}" title="${esc(c)}">
        ${thumb ? `<img src="${esc(IMG + thumb)}" alt="" loading="lazy">` : ""}<span>${esc(c)}</span></button>`;
    };

    main.innerHTML = `
      <div class="pdp">
        <div class="pdp-media">
          <a class="back" href="#/c/${slug(p.category)}">
            <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true"><path d="M7 1L2 6l5 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            ${esc(p.category)}
          </a>
          <div class="gallery${p.soldOut ? " sold" : ""}" id="gallery"></div>
        </div>
        <div class="pdp-info">
          <h1 class="pdp-name">${esc(p.name)}</h1>
          <p class="pdp-price${p.soldOut ? " struck" : ""}">${esc(priceText(p))}</p>
          ${p.soldOut ? '<p class="pdp-sold">Sold out — message us to ask about restock.</p>' : ""}

          ${
            p.colors.length
              ? `<fieldset class="opt"><legend>Colour <span class="muted" id="color-name">— ${esc(p.colors[0])}</span></legend>
                  <div class="swatches">${p.colors.map(swatch).join("")}</div></fieldset>`
              : ""
          }
          ${
            p.sizes.length
              ? `<fieldset class="opt"><legend>Size <span class="muted" id="size-name">${state.size ? "— " + esc(state.size) : ""}</span></legend>
                  <div class="sizes">${p.sizes
                    .map((s) => `<button type="button" class="size" data-size="${esc(s)}" aria-pressed="${s === state.size}"${p.soldOut ? " disabled" : ""}>${esc(s)}</button>`)
                    .join("")}</div></fieldset>`
              : ""
          }

          <button type="button" class="btn btn-block" id="add"${p.soldOut ? " disabled" : ""}>${p.soldOut ? "Sold out" : "Add to cart"}</button>
          <a class="btn btn-outline btn-block" id="ask" target="_blank" rel="noopener">
            ${waIcon()} Ask about this item
          </a>

          <div class="acc">
            <details open><summary>Details</summary>
              <ul>
                ${p.description ? `<li>${esc(p.description)}</li>` : ""}
                <li>Category: ${esc(p.category)}</li>
                ${p.colors.length ? `<li>Colours: ${esc(p.colors.join(", "))}</li>` : ""}
                ${p.sizes.length ? `<li>Sizes: ${esc(p.sizes.join(", "))}</li>` : "<li>Message us on WhatsApp for available sizes.</li>"}
              </ul>
            </details>
            <details><summary>How to order</summary>
              <ul>
                <li>Add items to your cart and tap “Order on WhatsApp”. Your order is sent to us as a message.</li>
                <li>We confirm sizes, stock and delivery in Kigali with you on WhatsApp.</li>
              </ul>
            </details>
            <details><summary>Visit the shop</summary>
              <ul>
                <li>${esc(SETTINGS.address)}</li>
                <li><a href="${esc(SETTINGS.mapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></li>
              </ul>
            </details>
          </div>
        </div>
      </div>`;

    const gallery = $("#gallery");
    const drawGallery = () => renderGallery(gallery, slides(), p.name, p.soldOut);
    drawGallery();

    const askLink = () => {
      const bits = [p.name, p.colors[state.color], state.size && "size " + state.size].filter(Boolean).join(", ");
      $("#ask").href = waUrl(`Hello Trap House Society, I'm interested in: ${bits}. Is it available?`);
    };
    askLink();

    $$(".swatch", main).forEach((b) =>
      b.addEventListener("click", () => {
        state.color = +b.dataset.color;
        $$(".swatch", main).forEach((x) => x.setAttribute("aria-pressed", x === b));
        $("#color-name").textContent = "— " + p.colors[state.color];
        if (hasColorPhotos) drawGallery();
        askLink();
      }),
    );
    $$(".size", main).forEach((b) =>
      b.addEventListener("click", () => {
        state.size = b.dataset.size;
        $$(".size", main).forEach((x) => x.setAttribute("aria-pressed", x === b));
        $("#size-name").textContent = "— " + state.size;
        b.closest(".opt").classList.remove("need");
        askLink();
      }),
    );
    $("#add").addEventListener("click", () => {
      if (p.soldOut) return;
      if (p.sizes.length && !state.size) {
        const f = $(".sizes", main).closest(".opt");
        f.classList.add("need");
        toast("Pick a size first");
        return;
      }
      cart.add({ id: p.id, color: p.colors[state.color] || "", size: state.size || "" });
      openPanel("cart");
    });
    scrollTop();
  }

  function renderGallery(el, srcs, alt, dim) {
    const many = srcs.length > 1;
    el.innerHTML = `
      <div class="track" tabindex="0" aria-label="${esc(alt)} photos">
        ${srcs
          .map(
            (s, i) =>
              `<div class="slide">${img(s, many ? `${alt} — photo ${i + 1} of ${srcs.length}` : alt, i === 0 ? "eager" : "lazy")}</div>`,
          )
          .join("")}
      </div>
      ${dim ? '<span class="sold-badge sold-badge-lg">Sold out</span>' : ""}
      ${
        many
          ? `<button class="g-arrow prev" aria-label="Previous photo"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
             <button class="g-arrow next" aria-label="Next photo"><svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
             <div class="dots">${srcs.map((_, i) => `<button class="dot" aria-label="Show photo ${i + 1}" aria-current="${i === 0}"></button>`).join("")}</div>`
          : ""
      }`;
    if (!many) return;
    const track = $(".track", el);
    const dots = $$(".dot", el);
    let idx = 0;
    const go = (i) => {
      const n = (i + srcs.length) % srcs.length;
      track.scrollTo({ left: n * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    };
    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== idx) {
        idx = i;
        dots.forEach((d, k) => d.setAttribute("aria-current", k === i));
      }
    }, { passive: true });
    $(".prev", el).addEventListener("click", () => go(idx - 1));
    $(".next", el).addEventListener("click", () => go(idx + 1));
    dots.forEach((d, k) => d.addEventListener("click", () => go(k)));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(idx - 1);
      if (e.key === "ArrowRight") go(idx + 1);
    });
  }

  /* ── Cart ──────────────────────────────────────────────── */

  const cart = {
    lines: [],
    load() {
      try {
        const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
        this.lines = Array.isArray(raw) ? raw.filter((l) => l && l.id && l.qty > 0) : [];
      } catch {
        this.lines = [];
      }
    },
    save() {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(this.lines));
      } catch {
        /* private mode: cart lasts for this visit only */
      }
      updateCartBadge();
      renderCart();
    },
    prune() {
      // drop items that were removed from products.yml or marked sold out
      this.lines = this.lines.filter((l) => {
        const p = getP(l.id);
        return p && !p.soldOut;
      });
      this.save();
    },
    add(item) {
      const l = this.lines.find((x) => x.id === item.id && x.color === item.color && x.size === item.size);
      if (l) l.qty++;
      else this.lines.push({ ...item, qty: 1 });
      this.save();
    },
    setQty(i, q) {
      if (q <= 0) this.lines.splice(i, 1);
      else this.lines[i].qty = Math.min(q, 99);
      this.save();
    },
    count() {
      return this.lines.reduce((n, l) => n + l.qty, 0);
    },
  };
  const getP = (id) => PRODUCTS.find((p) => p.id === id);

  function lineImage(p, color) {
    const k = p.colors.indexOf(color);
    return (k >= 0 && p.colorImages[k]) || p.image;
  }

  function updateCartBadge() {
    const n = cart.count();
    const b = $("#cart-count");
    b.textContent = n;
    b.hidden = n === 0;
    $("#cart-btn").setAttribute("aria-label", n ? `Open cart, ${n} item${n === 1 ? "" : "s"}` : "Open cart");
  }

  function renderCart() {
    const body = $("#cart-body");
    const foot = $("#cart-foot");
    const n = cart.count();
    $("#cart-title-count").textContent = n ? `(${n})` : "";
    if (!cart.lines.length) {
      body.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><a class="btn btn-outline" href="#/" data-close>Continue shopping</a></div>`;
      foot.innerHTML = "";
      return;
    }
    let total = 0;
    let unknown = 0;
    body.innerHTML = `<ul class="lines">${cart.lines
      .map((l, i) => {
        const p = getP(l.id);
        if (!p) return "";
        if (p.price == null) unknown += l.qty;
        else total += p.price * l.qty;
        const opts = [l.color, l.size && "Size " + l.size].filter(Boolean).join(" · ");
        return `<li class="line">
          <a href="#/p/${p.id}" class="line-img" tabindex="-1" aria-hidden="true">${img(lineImage(p, l.color), "")}</a>
          <div class="line-info">
            <a href="#/p/${p.id}" class="line-name">${esc(p.name)}</a>
            ${opts ? `<p class="muted">${esc(opts)}</p>` : ""}
            <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
              <button data-dec="${i}" aria-label="Decrease quantity">−</button>
              <span aria-live="polite">${l.qty}</span>
              <button data-inc="${i}" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <div class="line-end">
            <button class="line-x" data-rm="${i}" aria-label="Remove ${esc(p.name)}">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="2.5"/></svg>
            </button>
            <span class="line-price">${p.price == null ? "On request" : esc(fmt(p.price * l.qty))}</span>
          </div>
        </li>`;
      })
      .join("")}</ul>`;
    foot.innerHTML = `
      <p class="total"><span>Total</span><span>${total || !unknown ? esc(fmt(total)) : "On request"}</span></p>
      ${unknown ? `<p class="muted small">+ ${unknown} item${unknown === 1 ? "" : "s"} with price on request — we'll confirm on WhatsApp.</p>` : ""}
      <p class="muted small">Checkout opens WhatsApp with your order ready to send.</p>
      <a class="btn btn-block btn-wa" href="${esc(orderUrl())}" target="_blank" rel="noopener">${waIcon()} Order on WhatsApp</a>`;
  }

  function orderUrl() {
    let total = 0;
    let unknown = false;
    const items = cart.lines.flatMap((l) => {
      const p = getP(l.id);
      if (!p) return [];
      const parts = [p.name, l.color, l.size && "Size " + l.size, "Qty " + l.qty];
      if (p.price == null) {
        unknown = true;
        parts.push("price on request");
      } else {
        total += p.price * l.qty;
        parts.push(fmt(p.price * l.qty));
      }
      return ["• " + parts.filter(Boolean).join(" | ")];
    });
    const msg = [
      "Hello Trap House Society, I'd like to order:",
      "",
      ...items,
      "",
      "Total: " + (total || !unknown ? fmt(total) + (unknown ? " + items with price on request" : "") : "price on request"),
      "",
      "Name:",
      "Delivery address (Kigali) or pick up at the shop:",
    ].join("\n");
    return waUrl(msg);
  }

  const waUrl = (text) => `https://wa.me/${SETTINGS.whatsapp}?text=${encodeURIComponent(text)}`;
  const waIcon = () =>
    `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5 0 1.5-.6 1.7-1.2s.2-1.1.1-1.2l-.4-.2Z"/></svg>`;

  $("#cart-body").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.inc) cart.setQty(+t.dataset.inc, cart.lines[+t.dataset.inc].qty + 1);
    if (t.dataset.dec) cart.setQty(+t.dataset.dec, cart.lines[+t.dataset.dec].qty - 1);
    if (t.dataset.rm) cart.setQty(+t.dataset.rm, 0);
  });

  /* ── Menu, panels, footer ──────────────────────────────── */

  function renderMenu() {
    $("#menu-links").innerHTML = ["All", ...CATS]
      .map((c, i) => `<a class="menu-link" style="--i:${i}" href="${c === "All" ? "#/" : "#/c/" + slug(c)}">${esc(c)}</a>`)
      .join("");
    $("#menu-foot").innerHTML = contactHtml();
  }

  function renderFooter() {
    $("#footer").innerHTML = `
      <img src="assets/logo.png" alt="" width="72" height="72" class="footer-logo">
      <p class="footer-name">Trap House Society</p>
      ${contactHtml()}
      <p class="muted small">© ${new Date().getFullYear()} Trap House Society · Kigali</p>`;
  }

  function contactHtml() {
    return `<div class="contact">
      <a href="https://wa.me/${SETTINGS.whatsapp}" target="_blank" rel="noopener">${waIcon()} ${esc(SETTINGS.whatsappDisplay)}</a>
      <a href="${esc(SETTINGS.mapsUrl)}" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>
        ${esc(SETTINGS.address)}</a>
    </div>`;
  }

  let openId = null;
  let lastFocus = null;

  function openPanel(id) {
    closePanels(true);
    const el = document.getElementById(id);
    lastFocus = document.activeElement;
    openId = id;
    el.inert = false;
    el.classList.add("open");
    $("#scrim").hidden = false;
    requestAnimationFrame(() => $("#scrim").classList.add("on"));
    document.body.classList.add("locked");
    if (id === "menu") $("#menu-btn").setAttribute("aria-expanded", "true");
    if (id === "cart") renderCart();
    setTimeout(() => (el.querySelector("[data-close]") || el).focus(), 50);
  }

  function closePanels(silent) {
    if (!openId) return;
    const el = document.getElementById(openId);
    el.classList.remove("open");
    el.inert = true;
    $("#scrim").classList.remove("on");
    setTimeout(() => {
      if (!openId) $("#scrim").hidden = true;
    }, 300);
    document.body.classList.remove("locked");
    $("#menu-btn").setAttribute("aria-expanded", "false");
    openId = null;
    if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  $("#menu-btn").addEventListener("click", () => (openId === "menu" ? closePanels() : openPanel("menu")));
  $("#cart-btn").addEventListener("click", () => openPanel("cart"));
  $("#scrim").addEventListener("click", () => closePanels());
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closePanels();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanels();
    if (e.key === "Tab" && openId) trapFocus(e, document.getElementById(openId));
  });
  // clicking a link inside the menu closes it (route() also closes panels)
  $("#menu").addEventListener("click", (e) => {
    if (e.target.closest("a")) closePanels(true);
  });

  function trapFocus(e, el) {
    const f = $$("a[href], button:not([disabled]), input", el).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) (last.focus(), e.preventDefault());
    else if (!e.shiftKey && document.activeElement === last) (first.focus(), e.preventDefault());
  }

  function onSearch(e) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim() || "";
    location.hash = "#/search" + (q ? "?q=" + encodeURIComponent(q) : "");
  }
  $("#menu-search").addEventListener("submit", onSearch);

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("storage", (e) => {
    if (e.key === CART_KEY) {
      cart.load();
      updateCartBadge();
      renderCart();
    }
  });

  cart.load();
  if (typeof jsyaml === "undefined") showError("The page could not load its YAML reader. Check your internet connection and refresh.");
  else load();
})();
