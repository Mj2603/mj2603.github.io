/* Shared engine for the desks: seeded RNG, statistics, canvas charts, 3D surface, UI helpers.
   No dependencies. Exposes window.Q. */
(() => {
'use strict';
const Q = {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
Q.$ = $; Q.$$ = $$;
Q.css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- random numbers ---------- */
Q.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
Q.gauss = rng => { let spare = null; return () => { if (spare !== null) { const s = spare; spare = null; return s; } let u, v, s; do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const m = Math.sqrt(-2 * Math.log(s) / s); spare = v * m; return u * m; }; };

/* ---------- statistics ---------- */
Q.mean = a => { let s = 0; for (const x of a) s += x; return s / a.length; };
Q.std = a => { const m = Q.mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return Math.sqrt(s / Math.max(1, a.length - 1)); };
Q.se = a => Q.std(a) / Math.sqrt(a.length);
Q.quantile = (a, p) => { const b = [...a].sort((x, y) => x - y); const i = (b.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return b[lo] + (b[hi] - b[lo]) * (i - lo); };
Q.tailMean = (a, p) => { const b = [...a].sort((x, y) => x - y); const n = Math.max(1, Math.floor(b.length * p)); return Q.mean(b.slice(0, n)); };
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
Q.N = x => 0.5 * erfc(-x / Math.SQRT2);
Q.npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
Q.kde = (data, lo, hi, n = 140) => { const h = 1.06 * Q.std(data) * Math.pow(data.length, -0.2) || 1; const xs = [], ys = []; for (let i = 0; i < n; i++) { const x = lo + (hi - lo) * i / (n - 1); let s = 0; for (const d of data) { const u = (x - d) / h; if (u > -5 && u < 5) s += Math.exp(-0.5 * u * u); } xs.push(x); ys.push(s / (data.length * h * Math.sqrt(2 * Math.PI))); } return { xs, ys }; };

/* Nelder–Mead minimiser */
Q.nelderMead = (f, x0, { step = 0.1, iters = 600, tol = 1e-12 } = {}) => {
  const n = x0.length; let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += Array.isArray(step) ? step[i] : step; S.push(x); }
  let F = S.map(f), it = 0;
  for (; it < iters; it++) {
    const ord = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = ord.map(i => S[i]); F = ord.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < tol) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const pt = (t) => c.map((v, j) => v + t * (S[n][j] - v));
    const xr = pt(-1), fr = f(xr);
    if (fr < F[0]) { const xe = pt(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = fr < F[n] ? pt(-0.5) : pt(0.5), fc = f(xc);
      if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
  }
  const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b], iters: it };
};

/* ---------- formatting ---------- */
Q.fmt = (x, d = 2) => Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
Q.money = (x, d = 0) => Number.isFinite(x) ? (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
Q.signed = (x, d = 2) => Number.isFinite(x) ? (Math.abs(x) < 0.5 * Math.pow(10, -d) ? '' : x > 0 ? '+' : '−') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
Q.pct = (x, d = 1) => Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—';
const nice = (lo, hi, n = 5) => { const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag; const st = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag; const t = []; for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) t.push(+v.toFixed(12)); return t; };

/* ---------- canvas setup ---------- */
function ctx(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return { g, w, h };
}
Q.palette = () => ({ a: Q.css('--s1'), b: Q.css('--s2'), c: Q.css('--s3'), d: Q.css('--s4'), e: Q.css('--s5'), up: Q.css('--up'), dn: Q.css('--dn'), ink: Q.css('--ink'), muted: Q.css('--muted'), grid: Q.css('--grid'), axis: Q.css('--axis'), bg: Q.css('--panel') });

/* Line / area / scatter chart.
   series: {x, y, color, width, dash, fill, dots, r, band:{lo,hi}, label} */
Q.plot = (canvas, series, o = {}) => {
  const { g, w, h } = ctx(canvas), P = Q.palette();
  const pad = { l: o.padL ?? 58, r: 14, t: 10, b: o.xlabel ? 40 : 26 };
  let xs = [], ys = [];
  series.forEach(s => { s.x.forEach(v => Number.isFinite(v) && xs.push(v)); s.y.forEach(v => Number.isFinite(v) && ys.push(v)); if (s.band) { s.band.lo.forEach(v => ys.push(v)); s.band.hi.forEach(v => ys.push(v)); } });
  (o.hlines || []).forEach(v => ys.push(typeof v === 'object' ? v.y : v));
  if (!xs.length) return;
  const mn = a => a.reduce((m, v) => v < m ? v : m, Infinity), mxx = a => a.reduce((m, v) => v > m ? v : m, -Infinity);
  let x0 = o.xMin ?? mn(xs), x1 = o.xMax ?? mxx(xs), y0 = o.yMin ?? mn(ys), y1 = o.yMax ?? mxx(ys);
  if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; } if (o.yMin === undefined) { const p = (y1 - y0) * 0.06; y0 -= p; } if (o.yMax === undefined) y1 += (y1 - y0) * 0.06;
  if (x1 - x0 < 1e-12) { x0 -= 1; x1 += 1; }
  const X = v => pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r), Y = v => h - pad.b - (v - y0) / (y1 - y0) * (h - pad.t - pad.b);
  g.font = '11px "JetBrains Mono",ui-monospace,monospace'; g.lineWidth = 1;
  let lastY = null; nice(y0, y1, o.yTicks || 5).forEach(v => { const y = Y(v), lab = o.yfmt ? o.yfmt(v) : Q.fmt(v, Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 2); g.strokeStyle = P.grid; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); if (lab === lastY) return; lastY = lab; g.fillStyle = P.muted; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(lab, pad.l - 8, y); });
  const xt = o.xticks || nice(x0, x1, Math.max(3, Math.floor((w - pad.l) / 90)));
  let lastX = null; xt.forEach(v => { if (v < x0 - 1e-9 || v > x1 + 1e-9) return; const x = X(v), lab = o.xfmt ? o.xfmt(v) : Q.fmt(v, Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 2); g.strokeStyle = P.grid; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, h - pad.b); g.stroke(); if (lab === lastX) return; lastX = lab; g.fillStyle = P.muted; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(lab, x, h - pad.b + 7); });
  if (o.xlabel) { g.fillStyle = P.muted; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = '12px Inter,system-ui,sans-serif'; g.fillText(o.xlabel, pad.l + (w - pad.l - pad.r) / 2, h - 2); g.font = '11px "JetBrains Mono",monospace'; }
  if (o.ylabel) { g.save(); g.translate(12, pad.t + (h - pad.t - pad.b) / 2); g.rotate(-Math.PI / 2); g.fillStyle = P.muted; g.textAlign = 'center'; g.font = '12px Inter,system-ui,sans-serif'; g.fillText(o.ylabel, 0, 0); g.restore(); }
  g.save(); g.beginPath(); g.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); g.clip();
  (o.hlines || []).forEach(v => { const yv = typeof v === 'object' ? v.y : v; g.save(); g.setLineDash([4, 4]); g.strokeStyle = (typeof v === 'object' && v.color) || P.axis; g.beginPath(); g.moveTo(pad.l, Y(yv)); g.lineTo(w - pad.r, Y(yv)); g.stroke(); g.restore(); });
  (o.vlines || []).forEach(v => { g.save(); g.setLineDash([3, 4]); g.strokeStyle = P.axis; g.beginPath(); g.moveTo(X(v), pad.t); g.lineTo(X(v), h - pad.b); g.stroke(); g.restore(); });
  series.forEach(s => {
    const col = s.color;
    if (s.band) { g.fillStyle = col; g.globalAlpha = 0.14; g.beginPath(); s.x.forEach((v, i) => i ? g.lineTo(X(v), Y(s.band.hi[i])) : g.moveTo(X(v), Y(s.band.hi[i]))); for (let i = s.x.length - 1; i >= 0; i--) g.lineTo(X(s.x[i]), Y(s.band.lo[i])); g.closePath(); g.fill(); g.globalAlpha = 1; }
    if (s.dots) { g.fillStyle = col; s.x.forEach((v, i) => { if (!Number.isFinite(s.y[i])) return; g.beginPath(); g.arc(X(v), Y(s.y[i]), (s.rs ? s.rs[i] : s.r) || 3, 0, 7); g.fill(); if (s.ring) { g.strokeStyle = P.bg; g.lineWidth = 2; g.stroke(); } }); return; }
    if (s.bars) { g.fillStyle = col; const bw = s.bw; s.x.forEach((v, i) => { const yv = s.y[i]; g.fillRect(X(v - bw / 2) + 1, Math.min(Y(0), Y(yv)), Math.max(1, X(v + bw / 2) - X(v - bw / 2) - 2), Math.abs(Y(yv) - Y(0))); }); return; }
    if (s.err) { g.strokeStyle = col; g.lineWidth = 1.4; s.x.forEach((v, i) => { g.beginPath(); g.moveTo(X(v), Y(s.y[i] - s.err[i])); g.lineTo(X(v), Y(s.y[i] + s.err[i])); g.moveTo(X(v) - 4, Y(s.y[i] - s.err[i])); g.lineTo(X(v) + 4, Y(s.y[i] - s.err[i])); g.moveTo(X(v) - 4, Y(s.y[i] + s.err[i])); g.lineTo(X(v) + 4, Y(s.y[i] + s.err[i])); g.stroke(); }); }
    g.strokeStyle = col; g.lineWidth = s.width || 1.8; g.lineJoin = 'round'; g.setLineDash(s.dash || []);
    g.beginPath(); let on = false;
    s.x.forEach((v, i) => { const yv = s.y[i]; if (!Number.isFinite(yv)) { on = false; return; } on ? g.lineTo(X(v), Y(yv)) : g.moveTo(X(v), Y(yv)); on = true; });
    g.stroke(); g.setLineDash([]);
    if (s.fill) { g.lineTo(X(s.x[s.x.length - 1]), Y(Math.max(y0, 0))); g.lineTo(X(s.x[0]), Y(Math.max(y0, 0))); g.closePath(); const gr = g.createLinearGradient(0, pad.t, 0, h - pad.b); gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fill(); }
    if (s.marks) { s.marks.forEach(m => { g.fillStyle = m.color || col; g.beginPath(); const x = X(m.x), y = Y(m.y); if (m.shape === 'up') { g.moveTo(x, y - 6); g.lineTo(x - 5, y + 3); g.lineTo(x + 5, y + 3); } else if (m.shape === 'dn') { g.moveTo(x, y + 6); g.lineTo(x - 5, y - 3); g.lineTo(x + 5, y - 3); } else g.arc(x, y, m.r || 3.5, 0, 7); g.fill(); }); }
  });
  g.restore();
  // crosshair tooltip
  canvas._map = { X, Y, x0, x1, y0, y1, pad, w, h, series, o };
  if (!canvas._hover) { canvas._hover = true; attachHover(canvas); }
};
function attachHover(canvas) {
  let tip = canvas.parentElement.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; canvas.parentElement.style.position = 'relative'; canvas.parentElement.appendChild(tip); }
  canvas.addEventListener('mousemove', e => {
    const m = canvas._map; if (!m || m.o.noTip) return; const r = canvas.getBoundingClientRect(), px = e.clientX - r.left;
    if (px < m.pad.l || px > m.w - m.pad.r) { tip.style.opacity = 0; return; }
    const xv = m.x0 + (px - m.pad.l) / (m.w - m.pad.l - m.pad.r) * (m.x1 - m.x0);
    const rows = m.series.filter(s => s.label && !s.dots && !s.bars).map(s => { let bi = 0, bd = Infinity; s.x.forEach((v, i) => { const d = Math.abs(v - xv); if (d < bd) { bd = d; bi = i; } }); return `<span><i style="background:${s.color}"></i>${s.label}</span><b>${m.o.yfmt ? m.o.yfmt(s.y[bi]) : Q.fmt(s.y[bi], 2)}</b>`; });
    if (!rows.length) { tip.style.opacity = 0; return; }
    tip.innerHTML = `<div class="th">${m.o.xfmt ? m.o.xfmt(xv) : Q.fmt(xv, 2)}</div>` + rows.join('');
    tip.style.opacity = 1; const left = Math.min(px + 14, m.w - tip.offsetWidth - 4); tip.style.left = left + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

/* Heatmap with optional overlay lines. z[i][j]: i over ys (rows), j over xs (cols) */
Q.ramp = t => { // perceptual dark-navy → blue → cyan → pale
  const stops = [[48, 36, 28], [110, 64, 42], [178, 96, 54], [222, 160, 102], [246, 230, 200]];
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`;
};
Q.diverge = t => { // −1..1 red–neutral–blue
  t = Math.max(-1, Math.min(1, t)); const n = document.documentElement.dataset.theme === 'dark' ? [40, 33, 26] : [250, 246, 238], p = [47, 125, 109], m = [194, 70, 42];
  const c = (t >= 0 ? p : m).map((v, k) => Math.round(n[k] + (v - n[k]) * Math.abs(t))); return `rgb(${c[0]},${c[1]},${c[2]})`;
};
Q.heat = (canvas, z, xs, ys, o = {}) => {
  const { g, w, h } = ctx(canvas), P = Q.palette();
  const pad = { l: 58, r: o.legend ? 70 : 14, t: 10, b: o.xlabel ? 40 : 26 };
  const flat = z.flat(), lo = o.zMin ?? Math.min(...flat), hi = o.zMax ?? Math.max(...flat);
  const cw = (w - pad.l - pad.r) / xs.length, ch = (h - pad.t - pad.b) / ys.length, col = o.color || (v => Q.ramp((v - lo) / (hi - lo || 1)));
  for (let i = 0; i < ys.length; i++) for (let j = 0; j < xs.length; j++) { g.fillStyle = col(z[i][j]); g.fillRect(pad.l + j * cw, h - pad.b - (i + 1) * ch, cw + 0.6, ch + 0.6); }
  const X = v => pad.l + (v - xs[0]) / (xs[xs.length - 1] - xs[0]) * (w - pad.l - pad.r), Y = v => h - pad.b - (v - ys[0]) / (ys[ys.length - 1] - ys[0]) * (h - pad.t - pad.b);
  g.font = '11px "JetBrains Mono",monospace'; g.fillStyle = P.muted;
  nice(ys[0], ys[ys.length - 1], 5).forEach(v => { g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(o.yfmt ? o.yfmt(v) : Q.fmt(v, 1), pad.l - 8, Y(v)); });
  nice(Math.min(xs[0], xs[xs.length - 1]), Math.max(xs[0], xs[xs.length - 1]), 5).forEach(v => { g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(o.xfmt ? o.xfmt(v) : Q.fmt(v, 0), X(v), h - pad.b + 7); });
  if (o.xlabel) { g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = '12px Inter,system-ui,sans-serif'; g.fillText(o.xlabel, pad.l + (w - pad.l - pad.r) / 2, h - 2); }
  if (o.ylabel) { g.save(); g.translate(12, pad.t + (h - pad.t - pad.b) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.font = '12px Inter,system-ui,sans-serif'; g.fillText(o.ylabel, 0, 0); g.restore(); }
  (o.lines || []).forEach(L => { g.save(); g.strokeStyle = L.color; g.lineWidth = 2; g.setLineDash(L.dash || [6, 5]); g.beginPath(); L.x.forEach((v, i) => i ? g.lineTo(X(v), Y(L.y[i])) : g.moveTo(X(v), Y(L.y[i]))); g.stroke(); g.restore(); });
  if (o.legend) { const lx = w - pad.r + 18, top = pad.t + 14, bot = h - pad.b; for (let k = 0; k < 60; k++) { g.fillStyle = col(lo + (hi - lo) * (1 - k / 59)); g.fillRect(lx, top + (bot - top) * k / 60, 10, (bot - top) / 60 + 1); } g.fillStyle = P.muted; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '11px "JetBrains Mono",monospace'; g.fillText(o.legend.fmt(hi), lx + 14, top); g.fillText(o.legend.fmt((hi + lo) / 2), lx + 14, (top + bot) / 2); g.fillText(o.legend.fmt(lo), lx + 14, bot); g.textAlign = 'center'; g.fillText(o.legend.title, lx + 5, top - 10); }
};

/* ---------- 3D surface ---------- */
Q.surface = (canvas, data, o = {}) => {
  // data: {xs, ys, z: (i,j)=>number}  i over xs, j over ys
  const st = canvas._s3 || (canvas._s3 = { yaw: -0.85, pitch: 0.55, drag: null, auto: o.auto !== false });
  st.data = data; st.o = o;
  const draw = () => {
    const { g, w, h } = ctx(canvas), P = Q.palette(), { xs, ys, z } = st.data;
    const nx = xs.length, ny = ys.length; const Z = []; let zl = Infinity, zh = -Infinity;
    for (let i = 0; i < nx; i++) { Z.push([]); for (let j = 0; j < ny; j++) { const v = z(i, j); Z[i].push(v); if (Number.isFinite(v)) { zl = Math.min(zl, v); zh = Math.max(zh, v); } } }
    if (st.o.zMin !== undefined) zl = st.o.zMin; if (st.o.zMax !== undefined) zh = st.o.zMax;
    const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const sc = Math.min(w * 0.3, h * 0.36), ox = w / 2, oy = h * 0.5;
    const proj = (u, v, t) => { // u,v in [-1,1], t in [0,1] height
      const x = u, y = v, zz = (t - 0.5) * 1.1;
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const y2 = y1 * cp - zz * sp, z2 = y1 * sp + zz * cp;
      return [ox + x1 * sc, oy - z2 * sc, y2];
    };
    const U = i => -1 + 2 * i / (nx - 1), V = j => -1 + 2 * j / (ny - 1), T = v => (v - zl) / (zh - zl || 1);
    // floor grid + axes
    g.lineWidth = 1; g.strokeStyle = st.o.bare ? 'rgba(60,45,30,0.10)' : P.grid;
    for (let k = 0; k <= 4; k++) { const a = proj(-1 + k / 2, -1, 0), b = proj(-1 + k / 2, 1, 0), c = proj(-1, -1 + k / 2, 0), d = proj(1, -1 + k / 2, 0); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke(); }
    // back wall vertical lines
    const wallU = cy * sy > 0 ? 1 : -1;
    for (let k = 0; k <= 4 && !st.o.bare; k++) { const a = proj(-1, -1, k / 4), b = proj(1, -1, k / 4); g.strokeStyle = P.grid; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    // quads, painter's algorithm
    const quads = [];
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
      const vals = [Z[i][j], Z[i + 1][j], Z[i + 1][j + 1], Z[i][j + 1]]; if (vals.some(v => !Number.isFinite(v))) continue;
      const pts = [proj(U(i), V(j), T(vals[0])), proj(U(i + 1), V(j), T(vals[1])), proj(U(i + 1), V(j + 1), T(vals[2])), proj(U(i), V(j + 1), T(vals[3]))];
      quads.push({ pts, d: pts.reduce((s, p) => s + p[2], 0), t: T((vals[0] + vals[1] + vals[2] + vals[3]) / 4) });
    }
    quads.sort((a, b) => b.d - a.d);
    for (const q of quads) { g.beginPath(); q.pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
      if (st.o.stone) { const [a, b, c] = q.pts, ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1], area = Math.abs(ux * vy - uy * vx);
        const lit = Math.max(0, Math.min(1, 0.35 + 0.65 * Math.tanh(area / 90))), gv = Math.round(70 + 120 * lit * (0.55 + 0.45 * q.t));
        g.fillStyle = `rgb(${gv},${gv - 2},${gv - 6})`; g.fill(); g.strokeStyle = 'rgba(30,24,18,0.35)'; g.lineWidth = 0.5; g.stroke(); }
      else { g.fillStyle = Q.ramp(0.15 + 0.8 * q.t); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.6; g.stroke(); } }
    // highlight slice
    if (st.o.highlight !== undefined) { const j = st.o.highlight; g.strokeStyle = st.o.stone ? '#d9452b' : Q.css('--s3'); g.lineWidth = st.o.stone ? 3 : 2.4; g.beginPath(); for (let i = 0; i < nx; i++) { const p = proj(U(i), V(j), T(Z[i][j])); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
    // axis labels
    if (st.o.bare) return;
    g.fillStyle = P.muted; g.font = '11px "JetBrains Mono",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lab = (u, v, t, s) => { const p = proj(u, v, t); g.fillText(s, p[0], p[1]); };
    [0, 0.5, 1].forEach(f => { const i = Math.round(f * (nx - 1)); lab(U(i), 1.22, 0, st.o.xfmt ? st.o.xfmt(xs[i]) : xs[i]); });
    [0, 0.5, 1].forEach(f => { const j = Math.round(f * (ny - 1)); lab(1.22, V(j), 0, st.o.yfmt ? st.o.yfmt(ys[j]) : ys[j]); });
    [0, 0.5, 1].forEach(f => lab(-1.12, -1.12, f, st.o.zfmt ? st.o.zfmt(zl + (zh - zl) * f) : Q.fmt(zl + (zh - zl) * f, 2)));
    g.font = '12px Inter,system-ui,sans-serif'; g.fillStyle = P.ink;
    if (st.o.xlabel) lab(0, 1.48, 0, st.o.xlabel); if (st.o.ylabel) lab(1.5, 0, 0, st.o.ylabel); if (st.o.zlabel) lab(-1.12, -1.12, 1.18, st.o.zlabel);
  };
  st.draw = draw;
  if (!canvas._s3bound) {
    canvas._s3bound = true; canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', e => { st.drag = [e.clientX, e.clientY, st.yaw, st.pitch]; st.auto = false; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', e => { if (!st.drag) return; st.yaw = st.drag[2] + (e.clientX - st.drag[0]) * 0.008; st.pitch = Math.max(0.08, Math.min(1.35, st.drag[3] + (e.clientY - st.drag[1]) * 0.006)); draw(); });
    const up = () => { st.drag = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spin = () => { if (st.auto && !reduce && document.visibilityState === 'visible' && canvas.isConnected && canvas.offsetParent) { st.phase = (st.phase || 0) + 0.006; st.yaw = -0.85 + 0.38 * Math.sin(st.phase); draw(); } requestAnimationFrame(spin); };
    requestAnimationFrame(spin);
  }
  draw();
};

/* ---------- UI helpers ---------- */
Q.bind = (ids, cb) => ids.forEach(id => { const el = document.getElementById(id); if (!el) return; const out = document.querySelector(`[data-out="${id}"]`); const f = () => { if (out) out.textContent = el.dataset.fmt === 'pct' ? el.value + '%' : el.value; cb(); }; el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', f); if (out) out.textContent = el.dataset.fmt === 'pct' ? el.value + '%' : el.value; });
Q.num = id => parseFloat(document.getElementById(id).value);
Q.modes = (name, cb) => { const els = $$(`input[name="${name}"]`); const go = () => { const v = els.find(e => e.checked).value; $$(`[data-mode]`).forEach(p => p.hidden = p.dataset.mode !== v); try { history.replaceState(null, '', '#' + v); } catch (e) {} cb && cb(v); window.dispatchEvent(new Event('resize')); }; els.forEach(e => e.addEventListener('change', go)); const h = location.hash.slice(1); const pre = els.find(e => e.value === h); if (pre) pre.checked = true; go(); };
Q.debounce = (f, ms = 60) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
Q.busy = (el, on) => { if (el) el.classList.toggle('busy', on); };
Q.onRedraw = f => { const g = Q.debounce(f, 120); window.addEventListener('resize', g); document.addEventListener('themechange', () => f()); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => f()); };

/* shell: theme toggle + sidebar collapse */
document.addEventListener('DOMContentLoaded', () => {
  const t = document.getElementById('theme');
  if (t) t.addEventListener('click', () => { const r = document.documentElement; const dark = r.dataset.theme === 'dark'; r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('theme', r.dataset.theme); } catch (e) {} document.dispatchEvent(new Event('themechange')); });
  const c = document.getElementById('collapse');
  if (c) c.addEventListener('click', () => { document.body.classList.toggle('side-closed'); c.setAttribute('aria-expanded', !document.body.classList.contains('side-closed')); setTimeout(() => window.dispatchEvent(new Event('resize')), 220); });
});
window.Q = Q;
})();
