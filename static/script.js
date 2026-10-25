/* Veil — frontend: webcam cloak, Three.js stage, setups, effects. */
"use strict";

const $ = (s) => document.querySelector(s);
const W = 480, H = 360, MAX = 5;
const S = {                       // app state
  colors: [], quotes: [], color: null,
  opacity: 90, threshold: 30, blend: "solid",
  bg: null, calib: null, running: false,
  setups: Array(MAX).fill(null), active: -1,
};
const video = document.createElement("video");
video.playsInline = true; video.muted = true;
const work = document.createElement("canvas");   // pixel-processing canvas
work.width = W; work.height = H;
const wctx = work.getContext("2d", { willReadFrequently: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- Colour helpers ---------- */
function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
}

/* ---------- Cloak processing ---------- */
// Replaces pixels matching the cloak colour with the calibrated background.
function applyCloak(img, t) {
  const d = img.data, bg = S.bg;
  const [th, ts, tv] = hexToHsv(S.color.hex);
  const neutral = ts < 0.25;                         // greys/whites/blacks match on brightness
  const tolH = S.threshold * 1.2, tolV = S.threshold / 100 + 0.08;
  const a = S.opacity / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
    let hit = false;
    if (neutral) hit = s < 0.28 && Math.abs(v - tv) < tolV;
    else if (s > 0.3 && v > 0.18) {
      let h = 0; const df = mx - mn;
      h = mx === r ? ((g - b) / df) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4;
      h = ((h * 60) + 360) % 360;
      const dh = Math.abs(h - th); hit = Math.min(dh, 360 - dh) < tolH;
    }
    if (!hit) continue;
    let er = bg[i], eg = bg[i + 1], eb = bg[i + 2];  // "effect" colour by blend mode
    if (S.blend === "ghost") { er = er * 0.88 + 22; eg = eg * 0.88 + 26; eb = eb * 0.88 + 34; }
    else if (S.blend === "shimmer") {
      const px = (i / 4) % W, py = (i / 4 / W) | 0, k = 1 + 0.18 * Math.sin(t / 250 + px * 0.06 + py * 0.06);
      er *= k; eg *= k; eb *= k * 1.06;
    }
    d[i] = r + (er - r) * a; d[i + 1] = g + (eg - g) * a; d[i + 2] = b + (eb - b) * a;
  }
}

/* ---------- Camera + calibration ---------- */
async function startCamera() {
  const err = $("#cam-error"); err.hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showCamError("Camera access needs a secure page. Use http://localhost, or run `python app.py --https` for phones.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    video.srcObject = stream; await video.play();
    S.running = true; $("#stage-msg").textContent = ""; $("#btn-cam").textContent = "Camera on";
    $("#countdown").textContent = "Now calibrate: you'll step out of frame.";
  } catch (e) {
    const msg = e.name === "NotAllowedError" ? "Camera permission was denied. Allow it in your browser's address bar, then try again."
      : e.name === "NotFoundError" ? "No camera found. Connect a webcam and try again." : "Couldn't start the camera: " + e.message;
    showCamError(msg);
  }
}
function showCamError(m) { const e = $("#cam-error"); e.textContent = m; e.hidden = false; $("#stage-msg").textContent = "Camera unavailable"; }

async function calibrate() {
  if (!S.running) return toast("Start the camera first.");
  if (S.calib) return;
  const cd = $("#countdown");
  for (let i = 3; i > 0; i--) { cd.textContent = `Step out of frame… ${i}`; await sleep(1000); }
  cd.textContent = "Capturing background…";
  S.calib = { n: 0, acc: new Float32Array(W * H * 4) };
}
function grab() {            // draw mirrored video into the work canvas
  wctx.save(); wctx.scale(-1, 1); wctx.drawImage(video, -W, 0, W, H); wctx.restore();
  return wctx.getImageData(0, 0, W, H);
}

/* ---------- Three.js stage ---------- */
let renderer, scene, cam, plane, tex, ring, stars, tx = 0, ty = 0;
function initThree() {
  const box = $("#stage");
  if (!window.THREE) { $("#stage-msg").textContent = "3D engine failed to load. Check your internet connection."; return; }
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) { $("#stage-msg").textContent = "WebGL isn't available in this browser."; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  box.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100); cam.position.z = 5.4;
  tex = new THREE.CanvasTexture(work); tex.colorSpace = THREE.SRGBColorSpace;
  plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: tex }));
  plane.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.1, 3.1)), new THREE.LineBasicMaterial({ color: 0x8b5cf6 })));
  ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.012, 8, 140), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  ring.position.z = -0.8;
  const pos = new Float32Array(240 * 3).map(() => (Math.random() - 0.5) * 9);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc4b5fd, size: 0.03 }));
  scene.add(plane, ring, stars);
  drawIdle(); resize();
  addEventListener("resize", resize);
  box.addEventListener("pointermove", (e) => {
    const r = box.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  box.addEventListener("pointerleave", () => { tx = ty = 0; });
}
function drawIdle() {
  wctx.fillStyle = "#0b0a14"; wctx.fillRect(0, 0, W, H);
  wctx.fillStyle = "#6d5fa8"; wctx.font = "20px sans-serif"; wctx.textAlign = "center";
  wctx.fillText("Your camera appears here", W / 2, H / 2);
  if (tex) tex.needsUpdate = true;
}
function resize() {
  const w = $("#stage").clientWidth; if (!renderer || !w) return;
  renderer.setSize(w, w * 0.75, false);
}

/* ---------- Main loop ---------- */
function frame(t) {
  requestAnimationFrame(frame);
  if (S.running && video.readyState >= 2) {
    const img = grab();
    if (S.calib) {                       // accumulate 30 frames and average them
      const c = S.calib;
      for (let i = 0; i < img.data.length; i++) c.acc[i] += img.data[i];
      if (++c.n >= 30) {
        S.bg = new Uint8ClampedArray(c.acc.map((v) => v / c.n)); S.calib = null;
        $("#countdown").textContent = "Background locked. Step back in with your cloth!";
        toast("Calibration complete");
      }
    } else if (S.bg) { applyCloak(img, t); wctx.putImageData(img, 0, 0); }
    else $("#countdown").textContent = $("#countdown").textContent || "";
    if (tex) tex.needsUpdate = true;
  }
  if (renderer) {
    plane.rotation.y += (tx * 0.35 - plane.rotation.y) * 0.08;
    plane.rotation.x += (ty * 0.25 - plane.rotation.x) * 0.08;
    ring.rotation.z = t / 6000; ring.rotation.x = Math.sin(t / 3000) * 0.4; stars.rotation.y = t / 20000;
    renderer.render(scene, cam);
  }
}

/* ---------- Colour picker + setups ---------- */
function buildSwatches() {
  const box = $("#swatches");
  S.colors.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch"; b.style.setProperty("--c", c.hex); b.title = c.name; b.setAttribute("aria-label", c.name);
    b.onclick = () => { S.color = c; S.active = -1; syncUI(); };
    box.appendChild(b);
  });
}
function syncUI() {
  document.querySelectorAll(".swatch").forEach((el, i) => el.classList.toggle("on", S.colors[i].hex === S.color.hex));
  $("#color-name").textContent = S.color.name;
  $("#threshold").value = S.threshold; $("#opacity").value = S.opacity; $("#blend").value = S.blend;
  $("#o-th").textContent = S.threshold; $("#o-op").textContent = S.opacity + "%";
  renderSlots();
}
function currentSetup() { return { name: S.color.name, color: S.color.hex, opacity: S.opacity, threshold: S.threshold, blend: S.blend }; }
function applySetup(s) {
  S.color = S.colors.find((c) => c.hex === s.color) || { name: s.name, hex: s.color };
  S.opacity = s.opacity; S.threshold = s.threshold; S.blend = s.blend; syncUI();
}
function renderSlots() {
  const box = $("#slots"); box.innerHTML = "";
  S.setups.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "slot" + (s ? " full" : "") + (i === S.active ? " active" : "");
    b.textContent = i + 1; b.title = s ? `${s.name} (${s.blend})` : "Empty — click to save here";
    if (s) {
      b.style.setProperty("--c", s.color);
      const x = document.createElement("span"); x.className = "x"; x.textContent = "×"; x.title = "Delete setup";
      x.onclick = (e) => { e.stopPropagation(); S.setups[i] = null; if (S.active === i) S.active = -1; persist(); renderSlots(); };
      b.appendChild(x);
    }
    b.onclick = () => {
      if (s) { S.active = i; applySetup(s); }
      else { S.setups[i] = currentSetup(); S.active = i; persist(); renderSlots(); toast(`Saved to slot ${i + 1}`); }
    };
    box.appendChild(b);
  });
}
function saveActive() {
  let i = S.active >= 0 ? S.active : S.setups.findIndex((x) => !x);
  if (i < 0) return toast("All 5 slots are full. Select one to overwrite it.");
  S.setups[i] = currentSetup(); S.active = i; persist(); renderSlots(); toast(`Saved to slot ${i + 1}`);
}
async function persist() {             // server first, localStorage as backup
  try { localStorage.setItem("veil.setups", JSON.stringify(S.setups)); } catch (e) { /* storage blocked */ }
  try {
    await fetch("/api/setups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S.setups) });
  } catch (e) { toast("Saved locally (server unreachable)."); }
}
async function loadSetups() {
  try {
    const r = await fetch("/api/setups"); const j = await r.json();
    S.setups = Array.from({ length: MAX }, (_, i) => (j.setups || [])[i] || null);
  } catch (e) {
    try { const l = JSON.parse(localStorage.getItem("veil.setups") || "[]"); S.setups = Array.from({ length: MAX }, (_, i) => l[i] || null); } catch (_) { /* ignore */ }
  }
}

/* ---------- Content ---------- */
function buildQuotes() {
  $("#ticker").innerHTML = [...S.quotes, ...S.quotes].map((q) => `<span>✦ ${q}</span>`).join("");
  $("#quote-cards").innerHTML = S.quotes.slice(0, 8).map((q) => `<blockquote class="glass card">“${q}”</blockquote>`).join("");
  let n = 0; const el = $("#rotator");
  const show = () => { el.style.opacity = 0; setTimeout(() => { el.textContent = S.quotes[n++ % S.quotes.length]; el.style.opacity = 1; }, 500); };
  show(); setInterval(show, 5500);
}

/* ---------- Visual effects: particles, cursor trail, parallax, ripple ---------- */
function initFx() {
  const cv = $("#fx"), ctx = cv.getContext("2d"); let w, h; const trail = [];
  const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, s: Math.random() * 0.0004 + 0.0001, p: Math.random() * 6 }));
  const fit = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
  addEventListener("pointermove", (e) => trail.push({ x: e.clientX, y: e.clientY, life: 1 }));
  (function loop(t) {
    ctx.clearRect(0, 0, w, h);
    dust.forEach((d) => {
      d.y -= d.s; if (d.y < 0) d.y = 1;
      ctx.fillStyle = `rgba(196,181,253,${0.25 + 0.25 * Math.sin(t / 800 + d.p)})`;
      ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, 6.3); ctx.fill();
    });
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]; p.life -= 0.04; if (p.life <= 0) { trail.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(56,189,248,${p.life * 0.6})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life, 0, 6.3); ctx.fill();
    }
    requestAnimationFrame(loop);
  })(0);

  const layers = document.querySelectorAll("[data-depth]"); let ticking = false;
  addEventListener("scroll", () => {          // smooth parallax on scroll
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { layers.forEach((l) => (l.style.transform = `translateY(${scrollY * l.dataset.depth}px)`)); ticking = false; });
  }, { passive: true });

  document.addEventListener("click", (e) => {  // ripple on buttons
    const b = e.target.closest(".btn"); if (!b) return;
    const r = b.getBoundingClientRect(), s = document.createElement("span");
    s.className = "ripple"; s.style.left = e.clientX - r.left + "px"; s.style.top = e.clientY - r.top + "px";
    b.appendChild(s); setTimeout(() => s.remove(), 650);
  });
}

/* ---------- Boot ---------- */
async function boot() {
  try { const c = await (await fetch("/api/config")).json(); S.colors = c.colors; S.quotes = c.quotes; }
  catch (e) {
    S.colors = [{ name: "Emerald", hex: "#50C878" }, { name: "Crimson", hex: "#DC143C" }, { name: "Azure", hex: "#007FFF" }];
    S.quotes = ["I'd tell you a joke about invisibility, but you wouldn't see it coming."];
    toast("Server config unavailable. Using defaults.");
  }
  S.color = S.colors.find((c) => c.name === "Emerald") || S.colors[0];
  buildSwatches(); buildQuotes(); await loadSetups(); syncUI(); initThree(); initFx();
  $("#btn-cam").onclick = startCamera; $("#btn-cal").onclick = calibrate; $("#btn-save").onclick = saveActive;
  $("#threshold").oninput = (e) => { S.threshold = +e.target.value; $("#o-th").textContent = S.threshold; };
  $("#opacity").oninput = (e) => { S.opacity = +e.target.value; $("#o-op").textContent = S.opacity + "%"; };
  $("#blend").onchange = (e) => { S.blend = e.target.value; };
  let clicks = 0;                           // easter egg: 5 clicks on the logo
  $("#logo").addEventListener("click", () => {
    if (++clicks < 5) return; clicks = 0;
    document.body.classList.add("vanish"); toast("Where did everyone go?");
    setTimeout(() => document.body.classList.remove("vanish"), 3000);
  });
  requestAnimationFrame(frame);
  setTimeout(() => $("#loader").classList.add("done"), 1800);
}
boot();
