/* Market-making desk: Avellaneda–Stoikov vs. fixed-spread quoting, common random numbers.
   Mirrors Options-Market-Making-Simulator- (A–S reservation price and spread, Poisson fills A·e^{-kδ}). */
(() => {
'use strict';
const { $, num, fmt, money, signed, pct } = Q;

const params = () => ({ S0: 100, sigma: num('m-sig'), T: 1, steps: parseInt($('#m-steps').value, 10), A: num('m-A'), k: num('m-k'), gamma: num('m-gamma'),
  fee: num('m-fee'), qmax: parseInt($('#m-qmax').value, 10), n: parseInt($('#m-n').value, 10), seed: parseInt($('#m-seed').value, 10) || 1, kappa: num('m-kappa') });
const GAMMAS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8], HALFS = [0.3, 0.45, 0.6, 0.75, 0.9, 1.1, 1.4, 1.8];

let shocks = null, shockKey = '';
function draws(p) { // shared random numbers for every strategy (paired comparison)
  const key = [p.n, p.steps, p.seed].join('|'); if (key === shockKey) return shocks;
  const rng = Q.rng(p.seed), g = Q.gauss(rng), m = p.n * p.steps;
  shocks = { z: new Float64Array(m), ub: new Float64Array(m), ua: new Float64Array(m) };
  for (let i = 0; i < m; i++) { shocks.z[i] = g(); shocks.ub[i] = rng(); shocks.ua[i] = rng(); }
  shockKey = key; return shocks;
}
// strat: {kind:'as'|'sym'|'fixed', gamma, half}
function simulate(p, strat, D, keepPath = -1) {
  const dt = p.T / p.steps, sq = p.sigma * Math.sqrt(dt), out = { pnl: new Float64Array(p.n), qT: new Float64Array(p.n), qmax: new Float64Array(p.n), fills: new Float64Array(p.n), spread: 0 };
  const lnk = Math.log(1 + (strat.gamma || 0.1) / p.k); let spreadSum = 0, path = null;
  for (let j = 0; j < p.n; j++) {
    let S = p.S0, q = 0, cash = 0, fills = 0, mq = 0; const base = j * p.steps;
    const rec = j === keepPath ? (path = { t: [], S: [], r: [], bid: [], ask: [], q: [], pnl: [], buys: [], sells: [] }) : null;
    for (let i = 0; i < p.steps; i++) {
      const tau = p.T - i * dt; let r, h;
      if (strat.kind === 'fixed') { r = S; h = strat.half; }
      else { const g = strat.gamma; h = 0.5 * g * p.sigma * p.sigma * tau + lnk / g; r = strat.kind === 'as' ? S - q * g * p.sigma * p.sigma * tau : S; }
      const bid = r - h, ask = r + h; spreadSum += 2 * h;
      const pb = Math.min(1, p.A * Math.exp(-p.k * Math.max(0, S - bid)) * dt), pa = Math.min(1, p.A * Math.exp(-p.k * Math.max(0, ask - S)) * dt);
      if (D.ub[base + i] < pb && q < p.qmax) { q++; cash -= bid + p.fee; fills++; if (rec) rec.buys.push({ x: i * dt, y: bid }); }
      if (D.ua[base + i] < pa && q > -p.qmax) { q--; cash += ask - p.fee; fills++; if (rec) rec.sells.push({ x: i * dt, y: ask }); }
      mq = Math.max(mq, Math.abs(q));
      if (rec) { rec.t.push(i * dt); rec.S.push(S); rec.r.push(r); rec.bid.push(bid); rec.ask.push(ask); rec.q.push(q); rec.pnl.push(cash + q * S); }
      S += sq * D.z[base + i];
    }
    out.pnl[j] = cash + q * S; out.qT[j] = Math.abs(q); out.qmax[j] = mq; out.fills[j] = fills;
  }
  out.spread = spreadSum / (p.n * p.steps); out.path = path; return out;
}
const stats = (r, p) => { const a = [...r.pnl], m = Q.mean(a), s = Q.std(a); return { mean: m, se: Q.se(a), std: s, worst: Q.tailMean(a, 0.05), fills: Q.mean([...r.fills]), qT: Q.mean([...r.qT]), qmax: Q.mean([...r.qmax]), obj: m - 0.5 * p.kappa * s * s, spread: r.spread }; };
const paired = (a, b) => { const d = [...a.pnl].map((v, i) => v - b.pnl[i]); return { m: Q.mean(d), se: Q.se(d) }; };

let last = null;
function monteCarlo() {
  const p = params(), D = draws(p), t0 = performance.now(), P_ = Q.palette();
  const as = simulate(p, { kind: 'as', gamma: p.gamma }, D), sym = simulate(p, { kind: 'sym', gamma: p.gamma }, D);
  const fxm = simulate(p, { kind: 'fixed', half: as.spread / 2 }, D);
  const fxGrid = HALFS.map(h => ({ h, r: simulate(p, { kind: 'fixed', half: h }, D) })).map(o => ({ ...o, s: stats(o.r, p) }));
  const best = fxGrid.reduce((a, b) => b.s.obj > a.s.obj ? b : a);
  const asGrid = GAMMAS.map(g => ({ g, s: stats(simulate(p, { kind: 'as', gamma: g }, D), p) }));
  const symGrid = GAMMAS.map(g => ({ g, s: stats(simulate(p, { kind: 'sym', gamma: g }, D), p) }));
  const ms = performance.now() - t0;
  const S = { as: stats(as, p), sym: stats(sym, p), fxm: stats(fxm, p), best: best.s };
  last = { p, S };
  // strip
  $('#st-g').textContent = p.gamma; $('#st-sig').textContent = p.sigma; $('#st-k').textContent = p.k; $('#st-A').textContent = p.A;
  $('#st-fee').textContent = '$' + fmt(p.fee, 3); $('#st-n').textContent = p.n.toLocaleString(); $('#st-ms').textContent = fmt(ms, 0) + ' ms';
  // KPIs
  const dObj = paired(as, best.r); const dObjVal = S.as.obj - S.best.obj;
  $('#k-obj').textContent = signed(dObjVal, 2); $('#k-obj').className = 'v ' + (dObjVal >= 0 ? 'pos' : 'neg');
  $('#k-obj-s').textContent = `mean P&L diff ${signed(dObj.m, 2)} ± ${fmt(dObj.se, 2)} (paired, 1 s.e.). Rule: fixed half-spread ${best.h}`;
  $('#k-std').textContent = fmt(S.as.std, 2); $('#k-std-s').textContent = `matched fixed ${fmt(S.fxm.std, 2)} · no skew ${fmt(S.sym.std, 2)}`;
  $('#k-red').textContent = pct(1 - S.as.std / S.fxm.std, 0); $('#k-red').className = 'v ' + (S.as.std < S.fxm.std ? 'pos' : 'neg');
  $('#k-inv').textContent = fmt(S.as.qT, 1); $('#k-inv-s').textContent = `matched fixed ${fmt(S.fxm.qT, 1)} · peak ${fmt(S.as.qmax, 1)} vs ${fmt(S.fxm.qmax, 1)}`;
  // density
  const all = [...as.pnl, ...fxm.pnl, ...best.r.pnl, ...sym.pnl], lo = Q.quantile(all, 0.005), hi = Q.quantile(all, 0.995);
  const d = (r) => Q.kde([...r.pnl], lo, hi);
  const da = d(as), df = d(fxm), db = d(best.r), ds = d(sym);
  Q.plot($('#m-dens'), [
    { x: df.xs, y: df.ys, color: P_.c, width: 1.6, label: 'Fixed, matched' },
    { x: db.xs, y: db.ys, color: P_.d, width: 1.6, label: 'Best tuned fixed' },
    { x: ds.xs, y: ds.ys, color: P_.b, width: 1.6, label: 'A–S, no skew' },
    { x: da.xs, y: da.ys, color: P_.a, width: 2.4, fill: true, label: 'Avellaneda–Stoikov' },
  ], { xlabel: 'Terminal P&L ($)', yfmt: v => (v * 100).toFixed(1) + '%', yMin: 0, xfmt: v => money(v) });
  // frontier
  const fr = (arr, col, key, label) => ({ x: arr.map(o => o.s.std), y: arr.map(o => o.s.mean), color: col, width: 1.6, label, marks: arr.map(o => ({ x: o.s.std, y: o.s.mean, r: 2.6 })) });
  Q.plot($('#m-front'), [
    fr(fxGrid, P_.c, 'h', 'Fixed (half-spread grid)'), fr(symGrid, P_.b, 'g', 'A–S, no skew (γ grid)'), fr(asGrid, P_.a, 'g', 'A–S (γ grid)'),
    { x: [S.as.std], y: [S.as.mean], color: P_.a, dots: true, r: 7, ring: true }, { x: [S.fxm.std], y: [S.fxm.mean], color: P_.c, dots: true, r: 7, ring: true }, { x: [S.best.std], y: [S.best.mean], color: P_.d, dots: true, r: 7, ring: true },
  ], { xlabel: 'Std of P&L (risk)', ylabel: 'Mean P&L', xfmt: v => money(v), yfmt: v => money(v) });
  // table
  const row = (c, n, s, hl) => `<tr${hl ? ' class="hl"' : ''}><td><span class="sq" style="background:${c}"></span>${n}</td><td>${money(s.mean, 2)} <span class="muted">± ${fmt(s.se, 2)}</span></td><td>${money(s.std, 2)}</td><td class="${s.worst < 0 ? 'neg' : ''}">${money(s.worst, 2)}</td><td>${fmt(s.spread, 3)}</td><td>${fmt(s.fills, 1)}</td><td>${fmt(s.qT, 1)}</td><td>${fmt(s.qmax, 1)}</td><td>${money(s.obj, 2)}</td></tr>`;
  const ranked = [[P_.a, `Avellaneda–Stoikov, γ=${p.gamma}`, S.as], [P_.b, 'A–S spread, no inventory skew', S.sym], [P_.c, 'Fixed, matched to A–S spread', S.fxm], [P_.d, `Best tuned fixed (h=${best.h})`, S.best]];
  const topObj = Math.max(...ranked.map(r => r[2].obj));
  $('#m-tbl').innerHTML = ranked.map(([c, n, s]) => row(c, n, s, s.obj === topObj)).join('');
}
function replay() {
  const p = params(), D = draws(p), j = Math.min(p.n - 1, Math.max(0, parseInt($('#r-path').value, 10) || 0)), P_ = Q.palette();
  const a = simulate(p, { kind: 'as', gamma: p.gamma }, D, j), f = simulate(p, { kind: 'fixed', half: a.spread / 2 }, D, j);
  const pa = a.path, pf = f.path;
  Q.plot($('#r-quotes'), [
    { x: pa.t, y: pa.ask, color: P_.dn + '', width: 1, label: 'Ask' }, { x: pa.t, y: pa.bid, color: P_.up, width: 1, label: 'Bid' },
    { x: pa.t, y: pa.S, color: P_.ink, width: 1.4, label: 'Mid' }, { x: pa.t, y: pa.r, color: P_.a, width: 1.8, label: 'Reservation',
      marks: [...pa.buys.map(b => ({ ...b, shape: 'up', color: P_.up })), ...pa.sells.map(s => ({ ...s, shape: 'dn', color: P_.dn }))] },
  ], { xlabel: 'Time (fraction of session)', xfmt: v => v.toFixed(2) });
  Q.plot($('#r-inv'), [{ x: pf.t, y: pf.q, color: P_.c, width: 1.4, label: 'Fixed' }, { x: pa.t, y: pa.q, color: P_.a, width: 2, label: 'A–S' }], { hlines: [0], xfmt: v => v.toFixed(2), yfmt: v => v.toFixed(0) });
  Q.plot($('#r-pnl'), [{ x: pf.t, y: pf.pnl, color: P_.c, width: 1.4, label: 'Fixed' }, { x: pa.t, y: pa.pnl, color: P_.a, width: 2, label: 'A–S' }], { hlines: [0], xfmt: v => v.toFixed(2), yfmt: v => money(v) });
  $('#r-kpi-pnl').textContent = money(a.pnl[j], 2); $('#r-kpi-pnl-s').textContent = `fixed ${money(f.pnl[j], 2)}`;
  $('#r-kpi-f').textContent = a.fills[j]; $('#r-kpi-f-s').textContent = `${pa.buys.length} bought · ${pa.sells.length} sold · fixed ${f.fills[j]}`;
  $('#r-kpi-q').textContent = a.qmax[j]; $('#r-kpi-q-s').textContent = `fixed peak ${f.qmax[j]}`;
  $('#r-kpi-move').textContent = signed(pa.S[pa.S.length - 1] - pa.S[0], 2); $('#r-path-k').textContent = j;
}
function model() {
  const p = params(), P_ = Q.palette(), g = p.gamma, s2 = p.sigma * p.sigma, h0 = Math.log(1 + g / p.k) / g;
  const taus = Array.from({ length: 41 }, (_, i) => 1 - i / 40), qs = Array.from({ length: 41 }, (_, i) => -20 + i);
  const Z = qs.map(q => taus.map(t => -q * g * s2 * t));
  const mx = Math.max(...Z.flat().map(Math.abs)) || 1;
  const half = taus.map(t => 0.5 * g * s2 * t + h0);
  const qCross = half.map((h, i) => h / (g * s2 * Math.max(1e-6, taus[i])));
  Q.heat($('#md-heat'), Z, taus.map(t => (1 - t) * 100), qs, { color: v => Q.diverge(v / mx), xlabel: 'Session elapsed (%)', ylabel: 'Inventory q', xfmt: v => v.toFixed(0), yfmt: v => v.toFixed(0), legend: { title: 'r − S', fmt: v => '' },
    lines: [{ x: taus.map(t => (1 - t) * 100), y: qCross.map(v => Math.min(20, v)), color: P_.c }, { x: taus.map(t => (1 - t) * 100), y: qCross.map(v => Math.max(-20, -v)), color: P_.c }] });
  const tt = taus.map(t => (1 - t) * 100);
  Q.plot($('#md-spread'), [{ x: tt, y: half.map(h => 2 * h), color: P_.a, width: 2.2, label: 'Quoted spread' }, { x: tt, y: tt.map(() => 2 * h0), color: P_.muted, width: 1.2, dash: [4, 4], label: 'Liquidity term 2/γ·ln(1+γ/k)' }],
    { xlabel: 'Session elapsed (%)', yfmt: v => v.toFixed(2), xfmt: v => v.toFixed(0), yMin: 0 });
  $('#md-h0').textContent = fmt(2 * h0, 3); $('#md-risk').textContent = fmt(g * s2, 4); $('#md-q').textContent = fmt(qCross[0], 1);
}
/* ---- Live session: one trading session played forward in time ---- */
let L = { timer: null, k: 0, j: 0, a: null, f: null, p: null, paused: false };
function liveStart(j) {
  const p = params(), D = draws(p); L.p = p; L.j = j % p.n; L.k = 0;
  $('#st-g').textContent = p.gamma; $('#st-sig').textContent = p.sigma; $('#st-k').textContent = p.k; $('#st-A').textContent = p.A; $('#st-fee').textContent = '$' + fmt(p.fee, 3); $('#st-n').textContent = p.n.toLocaleString(); $('#st-ms').textContent = 'live';
  const a = simulate(p, { kind: 'as', gamma: p.gamma }, D, L.j), f = simulate(p, { kind: 'fixed', half: a.spread / 2 }, D, L.j);
  L.a = a.path; L.f = f.path; L.fills = [...L.a.buys.map(b => ({ ...b, side: 'B' })), ...L.a.sells.map(s => ({ ...s, side: 'S' }))].sort((x, y) => x.x - y.x);
  $('#lv-log').innerHTML = ''; $('#lv-sess').textContent = `Session ${L.j + 1}`;
}
function liveFrame() {
  const P_ = Q.palette(), pa = L.a, pf = L.f, k = Math.min(L.k, pa.t.length - 1), sl = a => a.slice(0, k + 1);
  const dt = L.p.T / L.p.steps, tNow = pa.t[k];
  const fills = L.fills.filter(x => x.x <= tNow + 1e-12);
  Q.plot($('#lv-quotes'), [
    { x: sl(pa.t), y: sl(pa.ask), color: P_.dn, width: 1, label: 'Ask' }, { x: sl(pa.t), y: sl(pa.bid), color: P_.up, width: 1, label: 'Bid' },
    { x: sl(pa.t), y: sl(pa.S), color: P_.ink, width: 1.4, label: 'Mid' },
    { x: sl(pa.t), y: sl(pa.r), color: P_.a, width: 1.8, label: 'Reservation', marks: fills.map(x => ({ x: x.x, y: x.y, shape: x.side === 'B' ? 'up' : 'dn', color: x.side === 'B' ? P_.up : P_.dn })) },
  ], { xMin: 0, xMax: L.p.T, xfmt: v => (v * 100).toFixed(0) + '%', yMin: Math.min(...pa.bid) - 0.3, yMax: Math.max(...pa.ask) + 0.3 });
  Q.plot($('#lv-inv'), [{ x: sl(pf.t), y: sl(pf.q), color: P_.c, width: 1.4, label: 'Fixed' }, { x: sl(pa.t), y: sl(pa.q), color: P_.a, width: 2, label: 'A–S' }],
    { xMin: 0, xMax: L.p.T, hlines: [0], xfmt: v => (v * 100).toFixed(0) + '%', yfmt: v => v.toFixed(0), yMin: Math.min(...pa.q, ...pf.q) - 1, yMax: Math.max(...pa.q, ...pf.q) + 1 });
  Q.plot($('#lv-pnl'), [{ x: sl(pf.t), y: sl(pf.pnl), color: P_.c, width: 1.4, label: 'Fixed' }, { x: sl(pa.t), y: sl(pa.pnl), color: P_.a, width: 2, label: 'A–S' }],
    { xMin: 0, xMax: L.p.T, hlines: [0], xfmt: v => (v * 100).toFixed(0) + '%', yfmt: v => money(v), yMin: Math.min(...pa.pnl, ...pf.pnl) - 2, yMax: Math.max(...pa.pnl, ...pf.pnl) + 2 });
  $('#lv-t').textContent = (tNow * 100).toFixed(0) + '%'; $('#lv-mid').textContent = fmt(pa.S[k], 2);
  $('#lv-quote').textContent = `${fmt(pa.bid[k], 2)} / ${fmt(pa.ask[k], 2)}`; $('#lv-skew').textContent = signed(pa.r[k] - pa.S[k], 3);
  $('#lv-q').textContent = signed(pa.q[k], 0); $('#lv-q-s').textContent = `fixed spread ${signed(pf.q[k], 0)}`;
  $('#lv-p').textContent = money(pa.pnl[k], 2); $('#lv-p').className = 'v ' + (pa.pnl[k] >= 0 ? 'pos' : 'neg'); $('#lv-p-s').textContent = `fixed spread ${money(pf.pnl[k], 2)}`;
  $('#lv-f').textContent = fills.length;
  const log = $('#lv-log'), shown = log.children.length;
  for (let i = shown; i < fills.length; i++) { const x = fills[i], li = document.createElement('li'); const qi = Math.min(pa.q.length - 1, Math.round(x.x / dt));
    li.innerHTML = `<span class="muted">${(x.x * 100).toFixed(1)}%</span> &nbsp;<b class="${x.side === 'B' ? 'up' : 'dn'}">${x.side === 'B' ? 'BOUGHT' : 'SOLD'}</b> 1 @ ${fmt(x.y, 2)} &nbsp;<span class="muted">inv → ${signed(pa.q[qi], 0)}</span>`; log.prepend(li); }
}
function liveLoop() {
  clearInterval(L.timer); const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!L.a) liveStart(L.j);
  if (reduce) { L.k = L.a.t.length - 1; liveFrame(); setLive(false); return; }
  setLive(true);
  L.timer = setInterval(() => { if (L.paused || mode !== 'live' || document.hidden) return; const speed = parseInt($('#lv-speed').value, 10); L.k += speed;
    if (L.k >= L.a.t.length + 25) { liveStart(L.j + 1); } liveFrame(); }, 50);
}
const setLive = on => { const el = $('#lv-state'); el.textContent = on && !L.paused ? 'LIVE' : 'PAUSED'; el.className = 'live' + (on && !L.paused ? '' : ' off'); };
let mode = 'live';
const run = () => { const b = $('#m-run'); Q.busy(b, true); setTimeout(() => { if (mode === 'live') { L.a = null; liveStart(L.j); liveFrame(); liveLoop(); } else ({ montecarlo: monteCarlo, replay, model })[mode](); Q.busy(b, false); }, 15); };
document.addEventListener('DOMContentLoaded', () => {
  Q.bind(['m-sig', 'm-A', 'm-k', 'm-gamma', 'm-fee', 'm-kappa', 'm-steps', 'm-qmax', 'm-n'], Q.debounce(() => { if (mode !== 'montecarlo') run(); }, 60));
  $('#m-run').addEventListener('click', run);
  $('#r-path').addEventListener('input', Q.debounce(replay, 80));
  $('#r-prev').addEventListener('click', () => { $('#r-path').value = Math.max(0, +$('#r-path').value - 1); replay(); });
  $('#r-next').addEventListener('click', () => { $('#r-path').value = +$('#r-path').value + 1; replay(); });
  $('#lv-pause').addEventListener('click', e => { L.paused = !L.paused; e.currentTarget.textContent = L.paused ? 'Resume' : 'Pause'; setLive(true); });
  $('#lv-next').addEventListener('click', () => { liveStart(L.j + 1); liveFrame(); });
  Q.modes('mode', m => { mode = m; run(); });
  Q.onRedraw(() => { if (mode === 'live') { if (L.a) liveFrame(); } else ({ montecarlo: monteCarlo, replay, model })[mode](); });
});
})();
