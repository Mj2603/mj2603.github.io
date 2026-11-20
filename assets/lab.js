/* Interactive quant lab — vanilla JS, no dependencies.
   Each demo is a small, faithful re-implementation of the model in the linked repository.
   All randomness is seeded so results are reproducible. */
(() => {
'use strict';

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussFactory(rng) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m; return u * m;
  };
}
// Standard normal CDF (Cody-style erfc approximation, |err| < 1.2e-7)
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const N = x => 0.5 * erfc(-x / Math.SQRT2);
const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/* ---------- tiny canvas chart ---------- */
function chart(canvas, series, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const pad = { l: 46, r: 12, t: 12, b: 26 };
  let xs = [], ys = [];
  series.forEach(s => { s.x.forEach(v => xs.push(v)); s.y.forEach(v => Number.isFinite(v) && ys.push(v)); });
  (opts.hlines || []).forEach(v => ys.push(v));
  if (!xs.length) return;
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (opts.yMin !== undefined) y0 = Math.min(y0, opts.yMin);
  if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
  const yp = (y1 - y0) * 0.08; y0 -= yp; y1 += yp;
  const X = v => pad.l + (v - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
  const Y = v => h - pad.b - (v - y0) / (y1 - y0) * (h - pad.t - pad.b);
  const grid = css('--grid'), muted = css('--muted');
  g.font = '11px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = muted; g.strokeStyle = grid; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + (y1 - y0) * i / 4, y = Y(v);
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(opts.yfmt ? opts.yfmt(v) : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)), pad.l - 6, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) {
    const v = x0 + (x1 - x0) * i / 4;
    g.fillText(opts.xfmt ? opts.xfmt(v) : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)), X(v), h - pad.b + 6);
  }
  (opts.hlines || []).forEach(v => {
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = muted; g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(w - pad.r, Y(v)); g.stroke(); g.restore();
  });
  if (opts.vline !== undefined) {
    g.save(); g.setLineDash([3, 3]); g.strokeStyle = muted; g.beginPath(); g.moveTo(X(opts.vline), pad.t); g.lineTo(X(opts.vline), h - pad.b); g.stroke(); g.restore();
  }
  series.forEach(s => {
    g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = s.width || 1.8;
    if (s.dots) { s.x.forEach((v, i) => { g.beginPath(); g.arc(X(v), Y(s.y[i]), s.r || 3, 0, 7); g.fill(); }); return; }
    g.beginPath(); let started = false;
    s.x.forEach((v, i) => { const y = s.y[i]; if (!Number.isFinite(y)) { started = false; return; } started ? g.lineTo(X(v), Y(y)) : g.moveTo(X(v), Y(y)); started = true; });
    g.stroke();
  });
}
function histChart(canvas, groups, bins = 40) {
  const all = groups.flatMap(gr => gr.data);
  const lo = Math.min(...all), hi = Math.max(...all), bw = (hi - lo) / bins || 1;
  const series = groups.map(gr => {
    const c = new Array(bins).fill(0);
    gr.data.forEach(v => c[Math.min(bins - 1, Math.floor((v - lo) / bw))]++);
    const x = [], y = [];
    c.forEach((n, i) => { x.push(lo + i * bw, lo + (i + 1) * bw); y.push(n / gr.data.length, n / gr.data.length); });
    return { x, y, color: gr.color, width: 2 };
  });
  chart(canvas, series, { yfmt: v => (v * 100).toFixed(0) + '%', xfmt: v => v.toFixed(0), yMin: 0 });
}
const bindRange = (id, cb) => { const el = $('#' + id), out = $(`[data-out="${id}"]`); const f = () => { if (out) out.textContent = el.value; cb(); }; el.addEventListener('input', f); return el; };
const val = id => parseFloat($('#' + id).value);

/* =====================================================================
   1) Black–Scholes pricer + Greeks + SABR smile
   ===================================================================== */
function bs(S, K, T, r, q, sig, call) {
  const sq = sig * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / sq, d2 = d1 - sq;
  const dfq = Math.exp(-q * T), dfr = Math.exp(-r * T);
  const price = call ? S * dfq * N(d1) - K * dfr * N(d2) : K * dfr * N(-d2) - S * dfq * N(-d1);
  const delta = call ? dfq * N(d1) : dfq * (N(d1) - 1);
  const gamma = dfq * npdf(d1) / (S * sq);
  const vega = S * dfq * npdf(d1) * Math.sqrt(T) / 100;               // per 1 vol point
  const theta = (-(S * dfq * npdf(d1) * sig) / (2 * Math.sqrt(T))
    + (call ? q * S * dfq * N(d1) - r * K * dfr * N(d2) : -q * S * dfq * N(-d1) + r * K * dfr * N(-d2))) / 365; // per day
  const rho = (call ? K * T * dfr * N(d2) : -K * T * dfr * N(-d2)) / 100;
  return { price, delta, gamma, vega, theta, rho };
}
// Hagan et al. (2002) lognormal SABR implied volatility
function sabrVol(F, K, T, a, b, rho, nu) {
  const eps = 1e-12, omb = 1 - b;
  if (Math.abs(Math.log(F / K)) < 1e-9) {
    const Fb = Math.pow(F, omb);
    return (a / Fb) * (1 + (omb * omb * a * a / (24 * Fb * Fb) + rho * b * nu * a / (4 * Fb) + (2 - 3 * rho * rho) * nu * nu / 24) * T);
  }
  const lfk = Math.log(F / K), fkb = Math.pow(F * K, omb / 2);
  const z = (nu / a) * fkb * lfk;
  const x = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  const den = fkb * (1 + omb * omb * lfk * lfk / 24 + omb ** 4 * lfk ** 4 / 1920);
  const corr = 1 + (omb * omb * a * a / (24 * fkb * fkb) + rho * b * nu * a / (4 * fkb) + (2 - 3 * rho * rho) * nu * nu / 24) * T;
  return (a / den) * (Math.abs(x) < eps ? 1 : z / x) * corr;
}
function initPricer() {
  const ids = ['bs-S', 'bs-K', 'bs-T', 'bs-r', 'bs-sig'];
  let call = true;
  const render = () => {
    const S = val('bs-S'), K = val('bs-K'), T = val('bs-T'), r = val('bs-r') / 100, sig = val('bs-sig') / 100;
    const o = bs(S, K, T, r, 0, sig, call);
    $('#bs-price').textContent = fmt(o.price, 3);
    $('#bs-delta').textContent = fmt(o.delta, 4);
    $('#bs-gamma').textContent = fmt(o.gamma, 4);
    $('#bs-vega').textContent = fmt(o.vega, 4);
    $('#bs-theta').textContent = fmt(o.theta, 4);
    $('#bs-rho').textContent = fmt(o.rho, 4);
    // put–call parity check
    const other = bs(S, K, T, r, 0, sig, !call).price;
    const parity = (call ? o.price - other : other - o.price) - (S - K * Math.exp(-r * T));
    $('#bs-parity').textContent = parity.toExponential(1);
    // payoff + value curve
    const xs = [], v = [], pay = [];
    for (let i = 0; i <= 120; i++) { const s = K * (0.5 + i / 120); xs.push(s); v.push(bs(s, K, T, r, 0, sig, call).price); pay.push(Math.max(call ? s - K : K - s, 0)); }
    chart($('#bs-chart'), [
      { x: xs, y: pay, color: css('--muted'), width: 1.4 },
      { x: xs, y: v, color: css('--accent'), width: 2.2 },
    ], { vline: S });
  };
  ids.forEach(id => bindRange(id, render));
  $$('[data-cp]').forEach(b => b.addEventListener('click', () => {
    call = b.dataset.cp === 'call'; $$('[data-cp]').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
  }));
  const renderSabr = () => {
    const F = 100, T = val('sb-T'), a = val('sb-a'), b = val('sb-b'), rho = val('sb-rho'), nu = val('sb-nu');
    const aa = a * Math.pow(F, 1 - b); // alpha quoted in "ATM-vol-like" units so sliders stay meaningful across beta
    const ks = [], vs = [];
    for (let i = 0; i <= 80; i++) { const K = 60 + i; ks.push(K); vs.push(sabrVol(F, K, T, aa, b, rho, nu) * 100); }
    const atm = sabrVol(F, F, T, aa, b, rho, nu) * 100;
    $('#sb-atm').textContent = fmt(atm, 2) + '%';
    const v90 = sabrVol(F, 90, T, aa, b, rho, nu) * 100, v110 = sabrVol(F, 110, T, aa, b, rho, nu) * 100;
    $('#sb-skew').textContent = fmt(v90 - v110, 2) + ' vol pts';
    chart($('#sb-chart'), [{ x: ks, y: vs, color: css('--accent'), width: 2.2 }], { vline: F, yfmt: v => v.toFixed(1) + '%' });
  };
  ['sb-T', 'sb-a', 'sb-b', 'sb-rho', 'sb-nu'].forEach(id => bindRange(id, renderSabr));
  render(); renderSabr();
  return () => { render(); renderSabr(); };
}

/* =====================================================================
   2) Price–time priority limit order book
   ===================================================================== */
class Book {
  constructor() { this.bids = new Map(); this.asks = new Map(); this.id = 1; this.trades = []; this.index = new Map(); }
  side(s) { return s === 'B' ? this.bids : this.asks; }
  best(s) { const m = this.side(s); if (!m.size) return null; const ks = [...m.keys()]; return s === 'B' ? Math.max(...ks) : Math.min(...ks); }
  add(sideCh, px, qty, type = 'L') {
    const id = this.id++, opp = sideCh === 'B' ? 'S' : 'B';
    let rem = qty;
    while (rem > 0) {
      const bp = this.best(opp);
      if (bp === null) break;
      if (type === 'L' && (sideCh === 'B' ? bp > px : bp < px)) break;
      const q = this.side(opp).get(bp);
      while (rem > 0 && q.length) {
        const rest = q[0], f = Math.min(rem, rest.qty);
        rest.qty -= f; rem -= f;
        this.trades.unshift({ px: bp, qty: f, aggr: sideCh, maker: rest.id, taker: id });
        if (rest.qty === 0) { q.shift(); this.index.delete(rest.id); }
      }
      if (!q.length) this.side(opp).delete(bp);
    }
    if (rem > 0 && type === 'L') {
      const m = this.side(sideCh); if (!m.has(px)) m.set(px, []);
      const o = { id, qty: rem, side: sideCh, px }; m.get(px).push(o); this.index.set(id, o);
    }
    this.trades.length = Math.min(this.trades.length, 40);
    return { id, filled: qty - rem, rested: type === 'L' ? rem : 0 };
  }
  cancel(id) {
    const o = this.index.get(id); if (!o) return false;
    const q = this.side(o.side).get(o.px); const i = q.indexOf(o); q.splice(i, 1);
    if (!q.length) this.side(o.side).delete(o.px); this.index.delete(id); return true;
  }
}
function initBook() {
  const book = new Book(); let rng = mulberry32(7); let gauss = gaussFactory(rng); let timer = null; let events = 0;
  // seed a two-sided book around 100.00 (ticks of 0.01 → integer ticks 10000)
  const seed = () => {
    for (let i = 1; i <= 6; i++) for (let j = 0; j < 2; j++) {
      book.add('B', 10000 - i * 2, 50 + Math.floor(rng() * 150));
      book.add('S', 10000 + i * 2, 50 + Math.floor(rng() * 150));
    }
  };
  const tick = t => (t / 100).toFixed(2);
  const render = (msg) => {
    const levels = (m, s) => [...m.entries()].sort((a, b) => s === 'B' ? b[0] - a[0] : a[0] - b[0]).slice(0, 8);
    const asks = levels(book.asks, 'S').reverse(), bids = levels(book.bids, 'B');
    const maxQ = Math.max(1, ...[...asks, ...bids].map(([, q]) => q.reduce((s, o) => s + o.qty, 0)));
    const row = ([px, q], s) => {
      const tot = q.reduce((a, o) => a + o.qty, 0);
      const chips = q.slice(0, 6).map(o => `<span class="chip" title="order #${o.id}">#${o.id}·${o.qty}</span>`).join('') + (q.length > 6 ? `<span class="chip">+${q.length - 6}</span>` : '');
      return `<div class="lvl ${s}"><span class="bar" style="width:${(tot / maxQ * 100).toFixed(1)}%"></span><span class="px">${tick(px)}</span><span class="qty">${tot}</span><span class="queue">${chips}</span></div>`;
    };
    const bb = book.best('B'), ba = book.best('S');
    $('#lob-ladder').innerHTML = asks.map(l => row(l, 'ask')).join('') +
      `<div class="spread">spread ${bb !== null && ba !== null ? tick(ba - bb) : '—'} · mid ${bb !== null && ba !== null ? tick((ba + bb) / 2) : '—'}</div>` +
      bids.map(l => row(l, 'bid')).join('');
    $('#lob-tape').innerHTML = book.trades.slice(0, 12).map(t =>
      `<li><span class="${t.aggr === 'B' ? 'up' : 'dn'}">${t.aggr === 'B' ? 'BUY ' : 'SELL'}</span> ${t.qty} @ ${tick(t.px)} <span class="muted">maker #${t.maker} ← taker #${t.taker}</span></li>`).join('') || '<li class="muted">No trades yet: cross the spread to trade.</li>';
    $('#lob-events').textContent = events.toLocaleString();
    if (msg) $('#lob-msg').textContent = msg;
  };
  const flow = () => {
    const bb = book.best('B') ?? 9990, ba = book.best('S') ?? 10010, mid = (bb + ba) / 2;
    const u = rng();
    if (u < 0.12 && book.index.size > 20) { const ids = [...book.index.keys()]; book.cancel(ids[Math.floor(rng() * ids.length)]); }
    else if (u < 0.30) { book.add(rng() < 0.5 ? 'B' : 'S', 0, 10 + Math.floor(rng() * 60), 'M'); }
    else { const s = rng() < 0.5 ? 'B' : 'S'; const off = Math.max(1, Math.round(Math.abs(gauss()) * 4));
      book.add(s, s === 'B' ? Math.round(mid) - off : Math.round(mid) + off, 10 + Math.floor(rng() * 120)); }
    events++;
  };
  $('#lob-form').addEventListener('submit', e => {
    e.preventDefault();
    const side = $('#lob-side').value, type = $('#lob-type').value, px = Math.round(parseFloat($('#lob-px').value) * 100), qty = parseInt($('#lob-qty').value, 10);
    if (!(qty > 0) || (type === 'L' && !(px > 0))) { render('Enter a positive quantity and price.'); return; }
    const r = book.add(side, px, qty, type); events++;
    render(`Order #${r.id}: filled ${r.filled}${type === 'L' ? `, rested ${r.rested}` : ''}.`);
  });
  $('#lob-cancel').addEventListener('click', () => {
    const id = parseInt($('#lob-cid').value, 10); const ok = book.cancel(id); if (ok) events++;
    render(ok ? `Cancelled #${id}.` : `#${id} is not resting.`);
  });
  $('#lob-auto').addEventListener('click', e => {
    if (timer) { clearInterval(timer); timer = null; e.target.textContent = 'Stream random flow'; return; }
    e.target.textContent = 'Pause flow';
    timer = setInterval(() => { for (let i = 0; i < 3; i++) flow(); render(); }, 120);
  });
  $('#lob-reset').addEventListener('click', () => {
    if (timer) { clearInterval(timer); timer = null; $('#lob-auto').textContent = 'Stream random flow'; }
    Object.assign(book, new Book()); rng = mulberry32(7); gauss = gaussFactory(rng); events = 0; seed(); render('Book reset.');
  });
  seed(); render('Seeded a two-sided book around 100.00.');
  return () => render();
}

/* =====================================================================
   3) Avellaneda–Stoikov vs fixed-spread market making (Monte Carlo)
   ===================================================================== */
function mmPath(p, strat, seed) {
  const rng = mulberry32(seed), gauss = gaussFactory(rng);
  const { S0, sigma, T, dt, gamma, k, A, fixedHalf, qmax } = p;
  let S = S0, q = 0, cash = 0, t = 0; const steps = Math.round(T / dt);
  const trace = strat.trace ? { t: [], S: [], r: [], bid: [], ask: [], q: [] } : null;
  for (let i = 0; i < steps; i++) {
    let r, half;
    if (strat.as) {
      const tau = T - t;
      r = S - q * gamma * sigma * sigma * tau;                                      // reservation price
      half = 0.5 * (gamma * sigma * sigma * tau + (2 / gamma) * Math.log(1 + gamma / k)); // optimal half-spread
    } else { r = S; half = fixedHalf; }
    const bid = r - half, ask = r + half;
    const db = Math.max(0, S - bid), da = Math.max(0, ask - S);
    const pb = A * Math.exp(-k * db) * dt, pa = A * Math.exp(-k * da) * dt;         // Poisson fill intensities
    if (rng() < pb && q < qmax) { q += 1; cash -= bid; }
    if (rng() < pa && q > -qmax) { q -= 1; cash += ask; }
    if (trace && i % 5 === 0) { trace.t.push(t); trace.S.push(S); trace.r.push(r); trace.bid.push(bid); trace.ask.push(ask); trace.q.push(q); }
    S += sigma * Math.sqrt(dt) * gauss(); t += dt;
  }
  return { pnl: cash + q * S, q, trace };
}
function initMM() {
  const run = () => {
    const p = { S0: 100, sigma: val('mm-sig'), T: 1, dt: 0.005, gamma: val('mm-gamma'), k: val('mm-k'), A: 140, qmax: 50, fixedHalf: 0 };
    // Match the fixed-spread strategy to A–S's time-averaged quoted spread, so the comparison isolates inventory skew.
    const avgHalf = 0.5 * (p.gamma * p.sigma * p.sigma * p.T / 2 + (2 / p.gamma) * Math.log(1 + p.gamma / p.k));
    p.fixedHalf = avgHalf;
    const n = parseInt($('#mm-n').value, 10);
    const as = [], fx = [], asq = [], fxq = [];
    for (let i = 0; i < n; i++) {
      const a = mmPath(p, { as: true }, 1000 + i), f = mmPath(p, { as: false }, 1000 + i); // common random numbers
      as.push(a.pnl); fx.push(f.pnl); asq.push(Math.abs(a.q)); fxq.push(Math.abs(f.q));
    }
    const sr = a => mean(a) / std(a);
    const set = (id, v) => { $(id).textContent = v; };
    set('#mm-as-mean', fmt(mean(as))); set('#mm-fx-mean', fmt(mean(fx)));
    set('#mm-as-std', fmt(std(as))); set('#mm-fx-std', fmt(std(fx)));
    set('#mm-as-sr', fmt(sr(as))); set('#mm-fx-sr', fmt(sr(fx)));
    set('#mm-as-q', fmt(mean(asq), 1)); set('#mm-fx-q', fmt(mean(fxq), 1));
    set('#mm-half', fmt(avgHalf, 3));
    histChart($('#mm-hist'), [{ data: fx, color: css('--muted') }, { data: as, color: css('--accent') }]);
    const tr = mmPath(p, { as: true, trace: true }, 1000).trace;
    chart($('#mm-path'), [
      { x: tr.t, y: tr.ask, color: css('--down'), width: 1.1 },
      { x: tr.t, y: tr.bid, color: css('--up'), width: 1.1 },
      { x: tr.t, y: tr.S, color: css('--ink'), width: 1.6 },
      { x: tr.t, y: tr.r, color: css('--accent'), width: 1.6 },
    ], { xfmt: v => v.toFixed(2) });
    chart($('#mm-inv'), [{ x: tr.t, y: tr.q, color: css('--accent'), width: 1.6 }], { hlines: [0], xfmt: v => v.toFixed(2), yfmt: v => v.toFixed(0) });
  };
  ['mm-gamma', 'mm-sig', 'mm-k'].forEach(id => bindRange(id, () => {}));
  $('#mm-run').addEventListener('click', run);
  run();
  return run;
}

/* =====================================================================
   4) Engle–Granger pairs trading, walk-forward
   ===================================================================== */
function ols(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx; return { a: my - b * mx, b };
}
// ADF (no lag, no constant) t-stat on residuals: Δe_t = φ e_{t-1} + u_t
function adfT(e) {
  let sxy = 0, sxx = 0; for (let i = 1; i < e.length; i++) { sxy += e[i - 1] * (e[i] - e[i - 1]); sxx += e[i - 1] ** 2; }
  const phi = sxy / sxx; let ss = 0;
  for (let i = 1; i < e.length; i++) ss += (e[i] - e[i - 1] - phi * e[i - 1]) ** 2;
  const se = Math.sqrt(ss / (e.length - 2) / sxx); return phi / se;
}
function initPairs() {
  const run = () => {
    const seed = parseInt($('#pa-seed').value, 10) || 1;
    const rng = mulberry32(seed), gauss = gaussFactory(rng);
    const kappa = val('pa-kappa'), entry = val('pa-entry'), costBps = val('pa-cost');
    const n = 756 * 2, train = 252, look = 20; // ~6y daily; same windows as the repo: 252d train, 63d test, 20d z-score
    // Simulate a cointegrated pair: log X is a random walk, log Y = 0.2 + 1.3 log X + OU spread
    const lx = [Math.log(100)], spr = [0];
    for (let i = 1; i < n; i++) { lx.push(lx[i - 1] + 0.0003 + 0.015 * gauss()); spr.push(spr[i - 1] * (1 - kappa) + 0.01 * gauss()); }
    const ly = lx.map((v, i) => 0.2 + 1.3 * v + spr[i]);
    // Walk-forward: re-estimate hedge ratio on trailing `train` days, trade the next `step` days out of sample
    const step = 63; const eq = [1], z = [], ts = []; let pos = 0; const rets = []; let tStats = [];
    for (let s = train; s + 1 < n; s += step) {
      const fit = ols(lx.slice(s - train, s), ly.slice(s - train, s));
      const res = ly.slice(s - train, s).map((v, i) => v - fit.a - fit.b * lx[s - train + i]);
      tStats.push(adfT(res));
      const tradable = adfT(res) < -3.34; // Engle–Granger 5% critical value (2 variables)
      for (let t = s; t < Math.min(s + step, n - 1); t++) {
        const win = []; for (let j = t - look; j < t; j++) win.push(ly[j] - fit.a - fit.b * lx[j]);
        const e = ly[t] - fit.a - fit.b * lx[t], m = mean(win), sd = std(win), zt = (e - m) / sd;
        z.push(zt); ts.push(t);
        let target = pos;
        if (!tradable) target = 0;
        else if (pos === 0 && zt > entry) target = -1;
        else if (pos === 0 && zt < -entry) target = 1;
        else if ((pos === 1 && zt >= 0) || (pos === -1 && zt <= 0)) target = 0;  // exit on mean cross, as in the repo
        const turn = Math.abs(target - pos);
        pos = target;
        const ry = ly[t + 1] - ly[t], rx = lx[t + 1] - lx[t];
        const r = pos * (ry - fit.b * rx) / (1 + Math.abs(fit.b)) - turn * costBps / 1e4;
        rets.push(r); eq.push(eq[eq.length - 1] * (1 + r));
      }
    }
    const ann = Math.sqrt(252), sr = mean(rets) / std(rets) * ann;
    let peak = 1, mdd = 0; eq.forEach(v => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    const years = rets.length / 252;
    $('#pa-sr').textContent = fmt(sr, 2);
    $('#pa-cagr').textContent = fmt((Math.pow(eq[eq.length - 1], 1 / years) - 1) * 100, 1) + '%';
    $('#pa-mdd').textContent = fmt(mdd * 100, 1) + '%';
    $('#pa-years').textContent = fmt(years, 1);
    $('#pa-adf').textContent = fmt(mean(tStats), 2);
    chart($('#pa-z'), [{ x: ts, y: z, color: css('--accent'), width: 1.2 }], { hlines: [entry, -entry, 0], xfmt: v => (v / 252).toFixed(1) + 'y', yfmt: v => v.toFixed(1) });
    chart($('#pa-eq'), [{ x: eq.map((_, i) => i), y: eq, color: css('--accent'), width: 1.8 }], { hlines: [1], xfmt: v => (v / 252).toFixed(1) + 'y' });
  };
  ['pa-kappa', 'pa-entry', 'pa-cost'].forEach(id => bindRange(id, () => {}));
  $('#pa-run').addEventListener('click', run);
  run();
  return run;
}

/* ---------- boot ---------- */
const redraws = [];
const boot = () => {
  if ($('#bs-chart')) redraws.push(initPricer());
  if ($('#lob-ladder')) redraws.push(initBook());
  if ($('#mm-hist')) redraws.push(initMM());
  if ($('#pa-eq')) redraws.push(initPairs());
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => redraws.forEach(f => f()), 150); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => redraws.forEach(f => f()));
  document.addEventListener('themechange', () => redraws.forEach(f => f()));
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
