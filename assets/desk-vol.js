/* Volatility desk: SABR surface, smile & risk-neutral density, live calibration, option book risk.
   Mirrors Derivatives-Pricing-Library-C- (Hagan 2002 SABR, Black–Scholes engine, Nelder–Mead calibration). */
(() => {
'use strict';
const { $, num, fmt, money, signed, pct } = Q;

/* ---- models ---- */
function sabr(F, K, T, a, b, rho, nu) {
  const omb = 1 - b, lfk = Math.log(F / K), fkb = Math.pow(F * K, omb / 2);
  const corr = 1 + (omb * omb * a * a / (24 * fkb * fkb) + rho * b * nu * a / (4 * fkb) + (2 - 3 * rho * rho) * nu * nu / 24) * T;
  const z = (nu / a) * fkb * lfk;
  let zx;
  if (Math.abs(z) < 1e-6) zx = 1 - 0.5 * rho * z + (2 - 3 * rho * rho) * z * z / 12;   // series near ATM
  else zx = z / Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  const den = fkb * (1 + omb * omb * lfk * lfk / 24 + omb ** 4 * lfk ** 4 / 1920);
  return (a / den) * zx * corr;
}
function black(F, K, T, r, v, call) {
  const df = Math.exp(-r * T), sq = v * Math.sqrt(T);
  if (T <= 0 || sq <= 0) return { p: df * Math.max(call ? F - K : K - F, 0), d: 0, g: 0, vega: 0, th: 0 };
  const d1 = (Math.log(F / K) + 0.5 * sq * sq) / sq, d2 = d1 - sq;
  const p = call ? df * (F * Q.N(d1) - K * Q.N(d2)) : df * (K * Q.N(-d2) - F * Q.N(-d1));
  return { p, d1, d2 };
}
// spot-based Greeks with F = S e^{rT}, sticky-strike vol
function legGreeks(S, K, T, r, v, call) {
  const F = S * Math.exp(r * T), { p, d1 } = black(F, K, T, r, v, call), sq = v * Math.sqrt(T);
  const delta = call ? Q.N(d1) : Q.N(d1) - 1, gamma = Q.npdf(d1) / (S * sq), vega = S * Q.npdf(d1) * Math.sqrt(T) / 100;
  const dt = 1 / 365, pT = T > dt ? black(S * Math.exp(r * (T - dt)), K, T - dt, r, v, call).p : Math.max(call ? S - K : K - S, 0);
  return { p, delta, gamma, vega, theta: pT - p };
}

/* ---- parameters ---- */
const P = () => ({ S: num('v-S'), r: num('v-r') / 100, b: num('v-beta'), a: num('v-alpha'), rho: num('v-rho'), nu: num('v-nu'), d: num('v-decay'), ts: num('v-term') });
// term structure: ATM-vol level and vol-of-vol vary with expiry
const paramsAt = (p, T) => ({ a: p.a * (1 + p.ts * (Math.sqrt(T) - 1)), nu: p.nu * Math.pow(T, -p.d) });
const volAt = (p, K, T) => { const F = p.S * Math.exp(p.r * T), q = paramsAt(p, T); return sabr(F, K, T, q.a * Math.pow(F, 1 - p.b), p.b, p.rho, q.nu); };
const KS = (lo = 70, hi = 130, n = 31) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
const TS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const Tsel = () => parseFloat($('#v-T').value);

/* ---- strip + KPIs (shared) ---- */
function strip(p) {
  $('#st-model').textContent = `SABR β=${p.b}`;
  $('#st-spot').textContent = fmt(p.S, 2); $('#st-rate').textContent = pct(p.r, 2);
  $('#st-rho').textContent = fmt(p.rho, 2); $('#st-nu').textContent = fmt(p.nu, 2);
  const T = Tsel(); $('#st-T').textContent = T + 'y';
}
/* ---- Surface mode ---- */
function surface() {
  const p = P(); strip(p);
  const ks = KS(70, 130, 25), ts = Array.from({ length: 18 }, (_, i) => 0.1 + 1.9 * i / 17);
  const T = Tsel(); let hj = 0, bd = 9; ts.forEach((t, j) => { if (Math.abs(t - T) < bd) { bd = Math.abs(t - T); hj = j; } });
  Q.surface($('#surf'), { xs: ks, ys: ts, z: (i, j) => volAt(p, ks[i] * Math.exp(p.r * ts[j]) * p.S / 100, ts[j]) * 100 },
    { xlabel: 'Strike (% fwd)', ylabel: 'Expiry', zlabel: 'Implied vol', xfmt: v => v.toFixed(0), yfmt: v => v.toFixed(1) + 'y', zfmt: v => v.toFixed(0) + '%', highlight: hj });
  const F1 = p.S * Math.exp(p.r * 1), atm1 = volAt(p, F1, 1), lo = volAt(p, F1 * 0.9, 1), hi = volAt(p, F1 * 1.1, 1);
  const a3 = volAt(p, p.S * Math.exp(p.r * 0.25), 0.25), a2 = volAt(p, p.S * Math.exp(p.r * 2), 2);
  $('#k-atm').textContent = pct(atm1, 2); $('#k-skew').textContent = signed((lo - hi) * 100, 2) + ' pts';
  $('#k-fly').textContent = signed(((lo + hi) / 2 - atm1) * 100, 2) + ' pts'; $('#k-term').textContent = signed((a2 - a3) * 100, 2) + ' pts';
  // slices
  const P_ = Q.palette(), cols = [P_.a, P_.b, P_.c, P_.d], show = [0.25, 0.5, 1, 2];
  const xs = KS(70, 130, 61);
  Q.plot($('#slices'), show.map((t, i) => ({ x: xs, y: xs.map(k => volAt(p, k / 100 * p.S * Math.exp(p.r * t), t) * 100), color: cols[i], width: t === T ? 2.6 : 1.6, label: t + 'y' })),
    { xlabel: 'Strike (% of forward)', yfmt: v => v.toFixed(1) + '%', xfmt: v => v.toFixed(0), vlines: [100] });
  const tt = Array.from({ length: 40 }, (_, i) => 0.08 + 1.92 * i / 39);
  Q.plot($('#term'), [
    { x: tt, y: tt.map(t => volAt(p, p.S * Math.exp(p.r * t) * 0.9, t) * 100), color: P_.c, width: 1.6, label: '90%' },
    { x: tt, y: tt.map(t => volAt(p, p.S * Math.exp(p.r * t), t) * 100), color: P_.a, width: 2.4, label: 'ATM' },
    { x: tt, y: tt.map(t => volAt(p, p.S * Math.exp(p.r * t) * 1.1, t) * 100), color: P_.b, width: 1.6, label: '110%' },
  ], { xlabel: 'Expiry (years)', yfmt: v => v.toFixed(1) + '%', xfmt: v => v.toFixed(1) });
}
/* ---- Smile & density ---- */
function smile() {
  const p = P(); strip(p); const T = Tsel(), F = p.S * Math.exp(p.r * T);
  const ks = KS(F * 0.55, F * 1.6, 141), v = ks.map(k => volAt(p, k, T));
  const call = k => black(F, k, T, p.r, volAt(p, k, T), true).p;
  const h = F * 0.004, dens = ks.map(k => Math.exp(p.r * T) * (call(k + h) - 2 * call(k) + call(k - h)) / (h * h));
  const lognorm = ks.map(k => { const s = volAt(p, F, T) * Math.sqrt(T), m = Math.log(F) - 0.5 * s * s; return Math.exp(-((Math.log(k) - m) ** 2) / (2 * s * s)) / (k * s * Math.sqrt(2 * Math.PI)); });
  const P_ = Q.palette();
  Q.plot($('#smile'), [{ x: ks, y: v.map(x => x * 100), color: P_.a, width: 2.4, label: 'SABR vol' }], { xlabel: `Strike (forward ${fmt(F, 2)})`, yfmt: x => x.toFixed(1) + '%', vlines: [F] });
  const neg = dens.some(d => d < -1e-6);
  Q.plot($('#dens'), [
    { x: ks, y: lognorm, color: P_.muted, width: 1.4, dash: [4, 4], label: 'Lognormal (ATM vol)' },
    { x: ks, y: dens, color: P_.b, width: 2.2, fill: true, label: 'SABR implied' },
  ], { xlabel: 'Terminal price', yfmt: x => (x * 100).toFixed(2) + '%', hlines: [0] });
  $('#dens-flag').innerHTML = neg ? '<span class="badge b-wip">Arbitrage</span> The density goes negative in the wing, a known failure of the Hagan expansion at low strikes and long expiries. Reduce ν or T to see it disappear.' : '<span class="badge b-ok">No arbitrage</span> The implied density is non-negative across the strike range.';
  const mass = dens.reduce((s, d, i) => i ? s + (ks[i] - ks[i - 1]) * (d + dens[i - 1]) / 2 : 0, 0);
  $('#k2-atm').textContent = pct(volAt(p, F, T), 2); $('#k2-mass').textContent = fmt(mass * 100, 1) + '%';
  $('#k2-skew').textContent = signed((volAt(p, F * 0.9, T) - volAt(p, F * 1.1, T)) * 100, 2) + ' pts';
  $('#k2-min').textContent = fmt(ks[v.indexOf(Math.min(...v))] / F * 100, 1) + '%';
  const rows = [0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.2].map(m => { const K = F * m, vol = volAt(p, K, T), c = legGreeks(p.S, K, T, p.r, vol, true), pu = legGreeks(p.S, K, T, p.r, vol, false);
    return `<tr${m === 1 ? ' class="hl"' : ''}><td>${(m * 100).toFixed(0)}% · ${fmt(K, 2)}</td><td>${pct(vol, 2)}</td><td>${fmt(c.p, 3)}</td><td>${fmt(pu.p, 3)}</td><td>${fmt(c.delta, 3)}</td><td>${fmt(c.vega, 4)}</td></tr>`; }).join('');
  $('#smile-tbl').innerHTML = rows;
}
/* ---- Calibration ---- */
function calibrate() {
  const p = P(); strip(p); const T = Tsel(), F = p.S * Math.exp(p.r * T), q = paramsAt(p, T), aTrue = q.a * Math.pow(F, 1 - p.b);
  const nQ = parseInt($('#c-n').value, 10), noise = num('c-noise') / 1e4, trials = parseInt($('#c-trials').value, 10), seed = parseInt($('#c-seed').value, 10) || 1;
  const strikes = Array.from({ length: nQ }, (_, i) => F * (0.75 + 0.5 * i / (nQ - 1)));
  const truth = strikes.map(k => sabr(F, k, T, aTrue, p.b, p.rho, q.nu));
  const fit = (quotes) => {
    const atm = sabr(F, F, T, aTrue, p.b, p.rho, q.nu); // ATM-anchored start: alpha from ATM level
    const x0 = [Math.log(atm * Math.pow(F, 1 - p.b)), 0, Math.log(0.5)];
    const obj = x => { const a = Math.exp(x[0]), rh = Math.tanh(x[1]), n = Math.exp(x[2]); let s = 0; for (let i = 0; i < strikes.length; i++) { const e = sabr(F, strikes[i], T, a, p.b, rh, n) - quotes[i]; s += e * e; } return Number.isFinite(s) ? s / strikes.length : 1e9; };
    const r = Q.nelderMead(obj, x0, { step: [0.2, 0.4, 0.4], iters: 1500, tol: 1e-16 });
    return { a: Math.exp(r.x[0]), rho: Math.tanh(r.x[1]), nu: Math.exp(r.x[2]), rmse: Math.sqrt(r.f), iters: r.iters };
  };
  const rng = Q.rng(seed), gs = Q.gauss(rng);
  const quotes = truth.map(v => v + noise * gs());
  const t0 = performance.now(), f = fit(quotes), ms = performance.now() - t0;
  $('#c-rmse').textContent = fmt(f.rmse * 1e4, 1) + ' bp'; $('#c-iters').textContent = f.iters; $('#c-ms').textContent = fmt(ms, 1) + ' ms';
  $('#c-noise-k').textContent = fmt(noise * 1e4, 0) + ' bp noise';
  const fitted = strikes.map(k => sabr(F, k, T, f.a, p.b, f.rho, f.nu));
  $('#c-max').textContent = fmt(Math.max(...fitted.map((v, i) => Math.abs(v - truth[i]))) * 1e4, 1) + ' bp';
  const P_ = Q.palette(), xs = KS(F * 0.72, F * 1.28, 80);
  Q.plot($('#c-chart'), [
    { x: xs, y: xs.map(k => sabr(F, k, T, aTrue, p.b, p.rho, q.nu) * 100), color: P_.muted, width: 1.4, dash: [5, 4], label: 'True' },
    { x: xs, y: xs.map(k => sabr(F, k, T, f.a, p.b, f.rho, f.nu) * 100), color: P_.a, width: 2.4, label: 'Fitted' },
    { x: strikes, y: quotes.map(v => v * 100), color: P_.c, dots: true, r: 4, ring: true },
  ], { xlabel: 'Strike', yfmt: v => v.toFixed(2) + '%', vlines: [F] });
  const tr = (n, t, e) => `<tr><td>${n}</td><td>${fmt(t, 4)}</td><td>${fmt(e, 4)}</td><td>${signed(e - t, 4)}</td></tr>`;
  $('#c-tbl').innerHTML = tr('α (raw)', aTrue, f.a) + tr('ρ', p.rho, f.rho) + tr('ν', q.nu, f.nu);
  // repeated trials: sampling distribution of fitted parameters
  const R = [], N_ = [], E = [];
  for (let k = 0; k < trials; k++) { const qq = truth.map(v => v + noise * gs()); const ff = fit(qq); R.push(ff.rho); N_.push(ff.nu); E.push(ff.rmse * 1e4); }
  const stat = (name, a, t) => `<tr><td>${name}</td><td>${fmt(t, 4)}</td><td>${fmt(Q.mean(a), 4)} ± ${fmt(Q.se(a), 4)}</td><td>${fmt(Q.std(a), 4)}</td><td>${fmt(Q.quantile(a, 0.05), 3)} … ${fmt(Q.quantile(a, 0.95), 3)}</td></tr>`;
  $('#c-mc').innerHTML = stat('ρ', R, p.rho) + stat('ν', N_, q.nu) + `<tr><td>RMSE (bp)</td><td>—</td><td>${fmt(Q.mean(E), 2)} ± ${fmt(Q.se(E), 2)}</td><td>${fmt(Q.std(E), 2)}</td><td>${fmt(Q.quantile(E, 0.05), 2)} … ${fmt(Q.quantile(E, 0.95), 2)}</td></tr>`;
  $('#c-trials-k').textContent = trials;
  Q.plot($('#c-scatter'), [{ x: R, y: N_, color: P_.a, dots: true, r: 2.4 }, { x: [p.rho], y: [q.nu], color: P_.c, dots: true, r: 6, ring: true }],
    { xlabel: 'Fitted ρ', ylabel: 'Fitted ν', xfmt: v => v.toFixed(2), yfmt: v => v.toFixed(2), noTip: true });
}
/* ---- Book ---- */
const PRESETS = {
  rr: [['C', 105, 0.5, 50], ['P', 95, 0.5, -50]],
  straddle: [['C', 100, 0.25, -50], ['P', 100, 0.25, -50]],
  strangle: [['C', 110, 0.5, 40], ['P', 90, 0.5, 40]],
  fly: [['C', 95, 0.5, 30], ['C', 100, 0.5, -60], ['C', 105, 0.5, 30]],
  calendar: [['C', 100, 0.25, -50], ['C', 100, 1, 50]],
};
function loadBook(key) {
  $('#book-rows').innerHTML = PRESETS[key].map(([t, k, T, q]) => `<tr><td><select aria-label="Type"><option value="C"${t === 'C' ? ' selected' : ''}>Call</option><option value="P"${t === 'P' ? ' selected' : ''}>Put</option></select></td><td><input type="number" aria-label="Strike" value="${k}" step="1"></td><td><input type="number" aria-label="Expiry (years)" value="${T}" step="0.05" min="0.02"></td><td><input type="number" aria-label="Contracts" value="${q}" step="10"></td></tr>`).join('');
}
const readBook = () => [...document.querySelectorAll('#book-rows tr')].map(tr => { const [s, k, t, q] = tr.querySelectorAll('select,input'); return { call: s.value === 'C', K: +k.value, T: Math.max(0.02, +t.value), q: +q.value }; }).filter(l => l.K > 0 && l.q);
function book() {
  const p = P(); strip(p); const legs = readBook(), mult = 100;
  const val = (S, dv = 0, dT = 0) => legs.reduce((s, l) => { const T = Math.max(1e-6, l.T - dT), F = S * Math.exp(p.r * T), v = Math.max(0.01, volAt({ ...p, S: p.S }, l.K * Math.exp(p.r * T) / Math.exp(p.r * l.T), l.T) + dv); return s + l.q * mult * black(F, l.K, T, p.r, v, l.call).p; }, 0);
  let tot = { p: 0, delta: 0, gamma: 0, vega: 0, theta: 0 }; const rows = [];
  legs.forEach(l => { const v = volAt(p, l.K, l.T), g = legGreeks(p.S, l.K, l.T, p.r, v, l.call); Object.keys(tot).forEach(k => tot[k] += g[k] * l.q * mult);
    rows.push(`<tr><td>${l.q > 0 ? 'Long' : 'Short'} ${Math.abs(l.q)} ${l.call ? 'call' : 'put'} ${l.K} · ${l.T}y</td><td>${pct(v, 2)}</td><td>${money(g.p * l.q * mult)}</td><td>${fmt(g.delta * l.q * mult, 0)}</td><td>${fmt(g.gamma * l.q * mult, 1)}</td><td>${money(g.vega * l.q * mult)}</td><td>${money(g.theta * l.q * mult)}</td></tr>`); });
  rows.push(`<tr class="hl"><td><b>Book</b></td><td></td><td>${money(tot.p)}</td><td>${fmt(tot.delta, 0)}</td><td>${fmt(tot.gamma, 1)}</td><td>${money(tot.vega)}</td><td>${money(tot.theta)}</td></tr>`);
  $('#book-tbl').innerHTML = rows.join('');
  const gpill = $('#b-gamma'); gpill.textContent = tot.gamma >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA'; gpill.className = 'pill ' + (tot.gamma >= 0 ? 'long' : 'short');
  $('#b-prem').textContent = money(tot.p); $('#b-delta').textContent = signed(tot.delta, 0) + ' sh'; $('#b-vega').textContent = money(tot.vega);
  $('#b-theta').textContent = money(tot.theta); $('#b-gam').textContent = signed(tot.gamma, 1) + ' sh / $';
  const base = val(p.S), ss = Array.from({ length: 81 }, (_, i) => p.S * (0.8 + 0.4 * i / 80)), P_ = Q.palette();
  const minT = Math.min(...legs.map(l => l.T));
  Q.plot($('#b-pnl'), [
    { x: ss, y: ss.map(s => val(s, 0, minT) - base), color: P_.muted, width: 1.4, dash: [5, 4], label: `At first expiry (${minT}y)` },
    { x: ss, y: ss.map(s => val(s, 0, 7 / 365) - base), color: P_.c, width: 1.6, label: 'In 1 week' },
    { x: ss, y: ss.map(s => val(s) - base), color: P_.a, width: 2.4, label: 'Today' },
  ], { xlabel: 'Spot', yfmt: v => money(v), hlines: [0], vlines: [p.S] });
  const moves = Array.from({ length: 21 }, (_, i) => -0.2 + 0.02 * i), dvs = Array.from({ length: 11 }, (_, i) => -0.1 + 0.02 * i);
  const Z = dvs.map(dv => moves.map(m => val(p.S * (1 + m), dv) - base)), mx = Math.max(...Z.flat().map(Math.abs)) || 1;
  Q.heat($('#b-heat'), Z, moves.map(m => m * 100), dvs.map(d => d * 100), { color: v => Q.diverge(v / mx), xlabel: 'Spot move (%)', ylabel: 'Vol shift (pts)', xfmt: v => v.toFixed(0), yfmt: v => v.toFixed(0), legend: { title: 'P&L', fmt: v => '' }, zMin: -mx, zMax: mx });
  $('#b-heat-rng').textContent = `${money(Math.min(...Z.flat()))} to ${money(Math.max(...Z.flat()))}`;
}

/* ---- Recalibration monitor: one noisy smile per "day", refit, track parameter stability ---- */
const M = { day: 0, rho: null, nu: null, hist: [], timer: null, rng: Q.rng(99), g: null };
function monitorStep() {
  const p = P(), T = Tsel(), F = p.S * Math.exp(p.r * T), q = paramsAt(p, T), aT = q.a * Math.pow(F, 1 - p.b);
  if (!M.g) M.g = Q.gauss(M.rng);
  if (M.rho === null || M.key !== [p.rho, p.nu, p.b, T, p.a].join()) { M.rho = p.rho; M.nu = q.nu; M.hist = []; M.day = 0; M.key = [p.rho, p.nu, p.b, T, p.a].join(); $('#mon-log').innerHTML = ''; }
  M.rho = Math.max(-0.95, Math.min(0.95, M.rho + 0.01 * M.g())); M.nu = Math.max(0.05, M.nu * Math.exp(0.02 * M.g()));   // the "market" drifts
  const ks = Array.from({ length: 11 }, (_, i) => F * (0.8 + 0.4 * i / 10)), quotes = ks.map(k => sabr(F, k, T, aT, p.b, M.rho, M.nu) + 0.001 * M.g());
  const prev = M.hist.length ? M.hist[M.hist.length - 1] : null;
  const start = prev ? [Math.log(prev.a), Math.atanh(Math.max(-0.99, Math.min(0.99, prev.frho))), Math.log(prev.fnu)] : [Math.log(aT), 0, Math.log(0.5)];
  const obj = x => { const a = Math.exp(x[0]), rh = Math.tanh(x[1]), n = Math.exp(x[2]); let e = 0; for (let i = 0; i < ks.length; i++) { const d = sabr(F, ks[i], T, a, p.b, rh, n) - quotes[i]; e += d * d; } return Number.isFinite(e) ? e / ks.length : 1e9; };
  const t0 = performance.now(), r = Q.nelderMead(obj, start, { step: [0.1, 0.2, 0.2], iters: 900, tol: 1e-16 }), ms = performance.now() - t0;
  const fit = { day: ++M.day, a: Math.exp(r.x[0]), frho: Math.tanh(r.x[1]), fnu: Math.exp(r.x[2]), rho: M.rho, nu: M.nu, rmse: Math.sqrt(r.f) * 1e4, it: r.iters, ms };
  M.hist.push(fit); if (M.hist.length > 60) M.hist.shift();
  const P_ = Q.palette(), d = M.hist.map(h => h.day);
  Q.plot($('#mon-rho'), [{ x: d, y: M.hist.map(h => h.rho), color: P_.muted, width: 1.2, dash: [4, 4], label: 'True ρ' }, { x: d, y: M.hist.map(h => h.frho), color: P_.a, width: 2, label: 'Fitted ρ' }], { xfmt: v => 'd' + v.toFixed(0), yfmt: v => v.toFixed(2) });
  Q.plot($('#mon-nu'), [{ x: d, y: M.hist.map(h => h.nu), color: P_.muted, width: 1.2, dash: [4, 4], label: 'True ν' }, { x: d, y: M.hist.map(h => h.fnu), color: P_.b, width: 2, label: 'Fitted ν' }], { xfmt: v => 'd' + v.toFixed(0), yfmt: v => v.toFixed(2) });
  const li = document.createElement('li');
  li.innerHTML = `<b>Day ${fit.day}</b> · ρ ${fmt(fit.frho, 3)} (${signed(fit.frho - fit.rho, 3)}) · ν ${fmt(fit.fnu, 3)} · RMSE ${fmt(fit.rmse, 1)} bp · ${fit.it} iter · ${fmt(ms, 1)} ms`;
  const log = $('#mon-log'); log.prepend(li); while (log.children.length > 40) log.lastChild.remove();
  $('#mon-rmse').textContent = fmt(Q.mean(M.hist.map(h => h.rmse)), 1) + ' bp'; $('#mon-day').textContent = fit.day;
}
function monitorLoop() {
  clearInterval(M.timer); const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; monitorStep();
  const st = $('#mon-state'); if (reduce) { st.className = 'live off'; st.textContent = 'PAUSED'; return; }
  st.className = 'live'; st.textContent = 'RECALIBRATING';
  M.timer = setInterval(() => { if (!document.hidden && mode === 'surface') monitorStep(); }, 1800);
}

/* ---- wiring ---- */
let mode = 'surface';
const run = () => ({ surface, smile, calibration: calibrate, book })[mode]();
document.addEventListener('DOMContentLoaded', () => {
  loadBook('rr');
  $('#book-preset').addEventListener('change', e => { loadBook(e.target.value); run(); });
  $('#book-rows').addEventListener('input', Q.debounce(run, 150));
  Q.bind(['v-S', 'v-r', 'v-beta', 'v-alpha', 'v-rho', 'v-nu', 'v-decay', 'v-term', 'v-T'], Q.debounce(() => { if (mode !== 'calibration') run(); }, 30));
  $('#c-run').addEventListener('click', () => { const b = $('#c-run'); Q.busy(b, true); setTimeout(() => { calibrate(); Q.busy(b, false); }, 20); });
  Q.bind(['c-n', 'c-noise', 'c-trials'], () => {});
  Q.modes('mode', m => { mode = m; run(); });
  monitorLoop();
  Q.onRedraw(run);
});
})();
