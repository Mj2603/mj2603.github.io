/* Pairs desk: Engle–Granger walk-forward with training-only hedge ratios, trailing z-score, cost sensitivity.
   Mirrors Statistical-Arbitrage-Research- after the look-ahead fixes (252d train / 63d test, 20d z, enter |z|≥2, exit on 0 cross). */
(() => {
'use strict';
const { $, num, fmt, signed, pct } = Q;
const TRAIN = 252, TEST = 63, LOOK = 20, CRIT = -3.37; // MacKinnon 5% critical value, 2 variables, constant

function simulate(o) { // o: {seed, kappa, beta, svol, n, kind: 'coint'|'break'|'rw'}
  const rng = Q.rng(o.seed), g = Q.gauss(rng); const x = [100], y = [], e = [0], z = [100];
  for (let t = 1; t < o.n; t++) { x.push(x[t - 1] * Math.exp(0.0002 + 0.015 * g())); const k = o.kind === 'break' && t > o.n / 2 ? 0 : o.kappa; e.push(e[t - 1] * (1 - k) + o.svol * g()); z.push(z[t - 1] * Math.exp(0.0002 + 0.015 * g())); }
  for (let t = 0; t < o.n; t++) y.push(o.kind === 'rw' ? 20 + o.beta * z[t] : 20 + o.beta * x[t] + e[t]);
  return { x, y };
}
function ols(x, y) { const n = x.length; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxy / sxx; return { a: my - b * mx, b }; }
function adf(e) { // Δe_t = c + φ e_{t-1} + u
  const n = e.length - 1, X = [], Y = []; for (let i = 1; i < e.length; i++) { X.push(e[i - 1]); Y.push(e[i] - e[i - 1]); }
  const f = ols(X, Y); let ss = 0, mx = Q.mean(X), sxx = 0; for (let i = 0; i < n; i++) { ss += (Y[i] - f.a - f.b * X[i]) ** 2; sxx += (X[i] - mx) ** 2; }
  return f.b / Math.sqrt(ss / (n - 2) / sxx);
}
function backtest(d, costBps, entry) {
  const { x, y } = d, n = x.length, rets = [], gross = [], wins = [], marks = [], zs = [], ts = []; let trades = 0, turnover = 0;
  for (let s = TRAIN; s < n - 1; s += TEST) {
    const fit = ols(x.slice(s - TRAIN, s), y.slice(s - TRAIN, s)), spr = i => y[i] - fit.b * x[i];
    const res = []; for (let i = s - TRAIN; i < s; i++) res.push(spr(i) - fit.a);
    const t = adf(res), pass = t < CRIT, end = Math.min(s + TEST, n - 1); let pos = 0, wr = 0, wt = 0;
    for (let i = s; i < end; i++) {
      const w = []; for (let j = i - LOOK; j < i; j++) w.push(spr(j)); // trailing window, warms up from training data
      const m = Q.mean(w), sd = Q.std(w), zt = (spr(i) - m) / sd; zs.push(zt); ts.push(i);
      let tgt = pos;
      if (!pass) tgt = 0; else if (pos === 0 && zt >= entry) tgt = -1; else if (pos === 0 && zt <= -entry) tgt = 1;
      else if ((pos === 1 && zt >= 0) || (pos === -1 && zt <= 0)) tgt = 0;
      if (i === end - 1) tgt = 0; // flatten at window end, exit cost charged
      const dpos = Math.abs(tgt - pos); if (dpos) { turnover += dpos; if (tgt !== 0) { trades++; marks.push({ x: i, y: zt, shape: tgt > 0 ? 'up' : 'dn' }); } else marks.push({ x: i, y: zt, r: 3 }); }
      const notional = Math.abs(y[i]) + Math.abs(fit.b) * Math.abs(x[i]);
      const r = tgt * ((y[i + 1] - y[i]) - fit.b * (x[i + 1] - x[i])) / notional;
      const c = dpos * costBps / 1e4; rets.push(r - c); gross.push(r); wr += r - c; wt += dpos ? 1 : 0; pos = tgt;
    }
    wins.push({ start: s, beta: fit.b, t, pass, ret: wr, trades: wt });
  }
  const sr = a => Q.std(a) > 0 ? Q.mean(a) / Q.std(a) * Math.sqrt(252) : 0, years = rets.length / 252;
  const eq = [1], eg = [1]; rets.forEach(r => eq.push(eq[eq.length - 1] * (1 + r))); gross.forEach(r => eg.push(eg[eg.length - 1] * (1 + r)));
  let pk = 1, mdd = 0; const dd = eq.map(v => { pk = Math.max(pk, v); const d = v / pk - 1; mdd = Math.min(mdd, d); return d; });
  const S = sr(rets);
  return { sr: S, srSe: Math.sqrt((1 + 0.5 * S * S) / years), srGross: sr(gross), cagr: Math.pow(eq[eq.length - 1], 1 / years) - 1, mdd, years, wins, trades, turnover: turnover / years, eq, eg, dd, zs, ts, marks, passRate: wins.filter(w => w.pass).length / wins.length, exposure: rets.filter((r, i) => gross[i] !== 0).length / rets.length };
}
const P = () => ({ seed: parseInt($('#p-seed').value, 10) || 1, kappa: num('p-kappa'), beta: num('p-beta'), svol: num('p-svol'), n: 252 * parseInt($('#p-years').value, 10), kind: $('#p-kind').value, cost: num('p-cost'), entry: num('p-entry') });

function runBacktest() {
  const p = P(), d = simulate(p), r = backtest(d, p.cost, p.entry), P_ = Q.palette();
  strip(p, r);
  $('#k-sr').textContent = fmt(r.sr, 2); $('#k-sr').className = 'v ' + (r.sr >= 0 ? 'pos' : 'neg'); $('#k-sr-s').textContent = `± ${fmt(r.srSe, 2)} (1 s.e.) · gross ${fmt(r.srGross, 2)}`;
  $('#k-cagr').textContent = pct(r.cagr, 1); $('#k-mdd').textContent = pct(r.mdd, 1);
  $('#k-pass').textContent = pct(r.passRate, 0); $('#k-pass-s').textContent = `${r.wins.filter(w => w.pass).length} of ${r.wins.length} quarterly windows passed EG at 5%`;
  $('#k-to').textContent = fmt(r.turnover, 1) + '×'; $('#k-to-s').textContent = `${r.trades} entries · in market ${pct(r.exposure, 0)} of days`;
  A.d = d; A.r = r; A.p = p; A.k = r.ts.length; drawBT(); return r;
}
/* progressive replay: the walk-forward is revealed day by day, with a log entry at every refit */
const A = { d: null, r: null, p: null, k: 0, timer: null };
function drawBT() {
  const { d, r, p } = A, P_ = Q.palette(), k = Math.max(1, Math.min(A.k, r.ts.length)), yr = v => (v / 252).toFixed(1) + 'y';
  const last = r.ts[k - 1], idx = d.x.map((_, i) => i).slice(0, last + 2);
  const xr = [0, d.x.length - 1];
  Q.plot($('#p-px'), [{ x: idx, y: idx.map(i => d.x[i] / d.x[0] * 100), color: P_.c, width: 1.3, label: 'X (rebased)' }, { x: idx, y: idx.map(i => d.y[i] / d.y[0] * 100), color: P_.a, width: 1.3, label: 'Y (rebased)' }],
    { xfmt: yr, vlines: [TRAIN], xMin: xr[0], xMax: xr[1], yMin: Math.min(...d.x.map(v => v / d.x[0] * 100), ...d.y.map(v => v / d.y[0] * 100)), yMax: Math.max(...d.x.map(v => v / d.x[0] * 100), ...d.y.map(v => v / d.y[0] * 100)) });
  Q.plot($('#p-z'), [{ x: r.ts.slice(0, k), y: r.zs.slice(0, k), color: P_.a, width: 1, label: 'z', marks: r.marks.filter(m => m.x <= last).map(m => ({ ...m, color: m.shape === 'up' ? P_.up : m.shape === 'dn' ? P_.dn : P_.muted })) }],
    { hlines: [p.entry, -p.entry, { y: 0, color: P_.axis }], xfmt: yr, yfmt: v => v.toFixed(1), vlines: r.wins.filter(w => w.start <= last).map(w => w.start), xMin: TRAIN, xMax: xr[1], yMin: Math.min(-4, ...r.zs), yMax: Math.max(4, ...r.zs) });
  const ex = r.eq.map((_, i) => TRAIN + i), n = k + 1;
  Q.plot($('#p-eq'), [{ x: ex.slice(0, n), y: r.eg.slice(0, n), color: P_.muted, width: 1.2, dash: [4, 4], label: 'Gross' }, { x: ex.slice(0, n), y: r.eq.slice(0, n), color: P_.a, width: 2, label: 'Net of costs' }],
    { hlines: [1], xfmt: yr, yfmt: v => v.toFixed(2), xMin: TRAIN, xMax: xr[1], yMin: Math.min(...r.eq, ...r.eg, 1), yMax: Math.max(...r.eq, ...r.eg, 1) });
  Q.plot($('#p-dd'), [{ x: ex.slice(0, n), y: r.dd.slice(0, n).map(v => v * 100), color: P_.dn, width: 1.4, fill: true, label: 'Drawdown' }], { xfmt: yr, yfmt: v => v.toFixed(1) + '%', yMax: 0, xMin: TRAIN, xMax: xr[1], yMin: Math.min(...r.dd) * 100 * 1.05 - 0.01 });
  const log = $('#bt-log'), shown = log.children.length, wins = r.wins.filter(w => w.start <= last);
  for (let i = shown; i < wins.length; i++) { const w = wins[i], li = document.createElement('li');
    li.innerHTML = `<b>Window ${i + 1}</b> · ${yr(w.start)} · β ${fmt(w.beta, 3)} · ADF ${fmt(w.t, 2)} → ${w.pass ? '<span class="pos">trade</span>' : '<span class="neg">stand aside</span>'}`; log.prepend(li); }
  const st = $('#bt-state'); const done = k >= r.ts.length; st.className = 'live' + (done ? ' off' : ''); st.textContent = done ? 'COMPLETE' : 'REPLAYING ' + yr(last);
}
function replayBT() {
  clearInterval(A.timer); $('#bt-log').innerHTML = '';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { A.k = A.r.ts.length; drawBT(); return; }
  A.k = 1; const stepN = Math.max(3, Math.ceil(A.r.ts.length / 220));
  A.timer = setInterval(() => { if (document.hidden) return; A.k += stepN; drawBT(); if (A.k >= A.r.ts.length) { clearInterval(A.timer); A.k = A.r.ts.length; drawBT(); } }, 40);
}
function strip(p, r) { $('#st-kind').textContent = { coint: 'COINTEGRATED', break: 'REGIME BREAK', rw: 'RANDOM-WALK CONTROL' }[p.kind]; $('#st-kind').className = 'pill ' + (p.kind === 'coint' ? 'long' : p.kind === 'rw' ? 'short' : '');
  $('#st-k').textContent = p.kappa; $('#st-b').textContent = p.beta; $('#st-c').textContent = p.cost + ' bps'; $('#st-e').textContent = '±' + p.entry; $('#st-y').textContent = fmt(r.years, 1) + 'y OOS'; }
function runWindows() {
  const p = P(), d = simulate(p), r = backtest(d, p.cost, p.entry), P_ = Q.palette(); strip(p, r);
  $('#w-tbl').innerHTML = r.wins.map((w, i) => `<tr${w.pass ? '' : ' style="opacity:.55"'}><td>${i + 1}</td><td>${(w.start / 252).toFixed(2)}y</td><td>${fmt(w.beta, 3)}</td><td>${fmt(w.t, 2)}</td><td>${w.pass ? '<span class="badge b-ok">trade</span>' : '<span class="badge b-wip">skip</span>'}</td><td>${w.trades}</td><td class="${w.ret >= 0 ? 'pos' : 'neg'}">${signed(w.ret * 100, 2)}%</td></tr>`).join('');
  const xs = r.wins.map(w => w.start);
  Q.plot($('#w-beta'), [{ x: xs, y: r.wins.map(w => w.beta), color: P_.a, width: 1.8, label: 'Estimated β', marks: r.wins.map(w => ({ x: w.start, y: w.beta, r: 3 })) }], { hlines: p.kind === 'rw' ? [] : [{ y: p.beta, color: P_.c }], xfmt: v => (v / 252).toFixed(1) + 'y', yfmt: v => v.toFixed(2) });
  Q.plot($('#w-adf'), [{ x: xs, y: r.wins.map(w => w.t), color: P_.d, width: 1.8, label: 'ADF t-stat', marks: r.wins.map(w => ({ x: w.start, y: w.t, r: 3, color: w.pass ? P_.up : P_.dn })) }], { hlines: [{ y: CRIT, color: P_.dn }], xfmt: v => (v / 252).toFixed(1) + 'y', yfmt: v => v.toFixed(1) });
}
function runSweep() {
  const p = P(), costs = [0, 2.5, 5, 7.5, 10, 15, 20], N = parseInt($('#s-n').value, 10), P_ = Q.palette(), t0 = performance.now();
  const groups = [['coint', P_.a, 'Cointegrated'], ['break', P_.c, 'Regime break'], ['rw', P_.dn, 'Random-walk control']];
  const res = groups.map(([kind]) => { const runs = []; for (let s = 0; s < N; s++) runs.push(simulate({ ...p, kind, seed: 1000 + s })); return costs.map(c => runs.map(d => backtest(d, c, p.entry))); });
  Q.plot($('#s-chart'), groups.map(([k, col, lab], gi) => ({ x: costs, y: res[gi].map(a => Q.mean(a.map(r => r.sr))), err: res[gi].map(a => Q.se(a.map(r => r.sr))), color: col, width: 2, label: lab, marks: costs.map((c, i) => ({ x: c, y: Q.mean(res[gi][i].map(r => r.sr)), r: 3.5 })) })),
    { xlabel: 'Cost, bps per unit change in position', ylabel: 'Mean OOS Sharpe', hlines: [{ y: 0, color: P_.axis }], xticks: costs, xfmt: v => v, yfmt: v => v.toFixed(1) });
  $('#s-tbl').innerHTML = groups.map(([k, col, lab], gi) => `<tr><td><span class="sq" style="background:${col}"></span>${lab}</td>${res[gi].map(a => { const m = Q.mean(a.map(r => r.sr)); return `<td class="${m >= 0 ? '' : 'neg'}">${fmt(m, 2)} <span class="muted">±${fmt(Q.se(a.map(r => r.sr)), 2)}</span></td>`; }).join('')}<td>${pct(Q.mean(res[gi][0].map(r => r.passRate)), 0)}</td></tr>`).join('');
  const be = (() => { const m = res[0].map(a => Q.mean(a.map(r => r.sr))); for (let i = 1; i < costs.length; i++) if (m[i] < 0 && m[i - 1] >= 0) return costs[i - 1] + (costs[i] - costs[i - 1]) * m[i - 1] / (m[i - 1] - m[i]); return NaN; })();
  $('#s-be').textContent = Number.isFinite(be) ? fmt(be, 1) + ' bps' : 'none in range'; $('#s-ms').textContent = `${N * 3 * costs.length} backtests in ${fmt(performance.now() - t0, 0)} ms`;
  $('#s-sr0').textContent = fmt(Q.mean(res[0][0].map(r => r.sr)), 2); $('#s-fp').textContent = pct(Q.mean(res[2][0].map(r => r.passRate)), 0);
  const r0 = backtest(simulate(p), p.cost, p.entry); strip(p, r0);
}
let mode = 'backtest', first = true;
const run = () => { const b = $('#p-run'); Q.busy(b, true); setTimeout(() => { ({ backtest: runBacktest, windows: runWindows, sweep: runSweep })[mode](); if (mode === 'backtest') { if (first) { first = false; replayBT(); } else { clearInterval(A.timer); $('#bt-log').innerHTML = ''; drawBT(); } } Q.busy(b, false); }, 15); };
document.addEventListener('DOMContentLoaded', () => {
  Q.bind(['p-kappa', 'p-beta', 'p-svol', 'p-cost', 'p-entry', 'p-kind', 'p-years', 's-n'], Q.debounce(() => { if (mode !== 'sweep') run(); }, 60));
  $('#p-run').addEventListener('click', run);
  $('#bt-replay').addEventListener('click', () => { if (A.r) replayBT(); });
  Q.modes('mode', m => { mode = m; run(); });
  Q.onRedraw(() => { if (mode === 'backtest') { if (A.r) drawBT(); } else ({ windows: runWindows, sweep: runSweep })[mode](); });
});
})();
