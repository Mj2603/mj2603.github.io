/* Home page: hero surface and project tiles. */
(() => {
'use strict';
const TILES = [
  { href: 'vol.html', no: '01', tc: '#4338ca', title: 'Volatility surface', stack: 'C++17 · SABR · Black–Scholes engines',
    text: 'Hagan SABR pricing and calibration with a rotating implied-vol surface, risk-neutral density checks, daily recalibration and option-book scenario risk.',
    facts: [['1e-11', 'vs. reference'], ['~0.4 ms', 'per smile fit'], ['8', 'test suites']] },
  { href: 'mm.html', no: '02', tc: '#0f766e', title: 'Market making', stack: 'Python · Avellaneda–Stoikov · walk-forward',
    text: 'A live quoting session against simulated order flow, plus a paired Monte Carlo comparison of inventory-aware quoting with tuned fixed-spread rules.',
    facts: [['−26–35%', 'P&L dispersion'], ['−22–24%', 'peak inventory'], ['127', 'tests']] },
  { href: 'lob.html', no: '03', tc: '#b45309', title: 'Order book engine', stack: 'C++17 · price–time FIFO · bitmap best-price',
    text: 'A limit order book with live order flow, queue positions, depth and micro-price. The C++ engine is differentially tested against a reference book.',
    facts: [['~10M', 'events / s'], ['0.50 µs', 'p99 latency'], ['85×', 'speed-up']] },
  { href: 'pairs.html', no: '04', tc: '#7e22ce', title: 'Statistical arbitrage', stack: 'Python · Engle–Granger · walk-forward',
    text: 'A cointegration pairs strategy replayed window by window, using training data only, with cost sensitivity and random-walk controls.',
    facts: [['1.06', 'Sharpe before costs'], ['−0.29', 'Sharpe at 10 bps'], ['46', 'tests']] },
];
function sabr(F, K, T, a, b, rho, nu) { const omb = 1 - b, l = Math.log(F / K), f = Math.pow(F * K, omb / 2), z = (nu / a) * f * l;
  const zx = Math.abs(z) < 1e-6 ? 1 - 0.5 * rho * z : z / Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  return a / (f * (1 + omb * omb * l * l / 24 + omb ** 4 * l ** 4 / 1920)) * zx * (1 + (omb * omb * a * a / (24 * f * f) + rho * b * nu * a / (4 * f) + (2 - 3 * rho * rho) * nu * nu / 24) * T); }
const vol = (k, t) => sabr(100, k, t, 0.25 * (1 + 0.1 * (Math.sqrt(t) - 1)) * 10, 0.5, -0.35, 0.6 * Math.pow(t, -0.3)) * 100;
function hero() { const ks = Array.from({ length: 25 }, (_, i) => 70 + 2.5 * i), ts = Array.from({ length: 18 }, (_, i) => 0.1 + 1.9 * i / 17);
  Q.surface(document.getElementById('hero-surf'), { xs: ks, ys: ts, z: (i, j) => vol(ks[i], ts[j]) }, { xlabel: 'Strike', ylabel: 'Expiry', zlabel: 'Vol', xfmt: v => v.toFixed(0), yfmt: v => v.toFixed(1) + 'y', zfmt: v => v.toFixed(0) + '%' }); }
function previews() {
  const P = Q.palette(), c = i => document.getElementById('pv-' + i), o = { noTip: true, padL: 42 };
  const xs = Array.from({ length: 61 }, (_, i) => 70 + i);
  Q.plot(c(0), [0.25, 0.5, 1, 2].map((t, i) => ({ x: xs, y: xs.map(k => vol(k, t)), color: ['#4338ca', '#6366f1', '#a5b4fc', '#c7d2fe'][i], width: 2 })), { ...o, yfmt: v => v.toFixed(0) + '%', xfmt: v => v.toFixed(0) });
  // normal fits to the market-making page's default run (A–S mean 64.0, sd 6.2; fixed mean 67.3, sd 13.1)
  const n = (m, s) => { const x = [], y = []; for (let i = 0; i < 120; i++) { const v = 20 + 90 * i / 119; x.push(v); y.push(Math.exp(-0.5 * ((v - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI))); } return { x, y }; };
  const a = n(64.0, 6.2), f = n(67.3, 13.1);
  Q.plot(c(1), [{ ...f, color: P.muted, width: 1.6 }, { ...a, color: '#0f766e', width: 2.2, fill: true }], { ...o, yMin: 0, yfmt: () => '', xfmt: v => '$' + v.toFixed(0) });
  const bx = [], by = [], ax = [], ay = []; let cb = 0, ca = 0; for (let i = 1; i <= 25; i++) { cb += 80 + 60 * Math.sin(i * 1.7) ** 2 + i * 6; ca += 70 + 70 * Math.cos(i * 1.3) ** 2 + i * 7; bx.push(100 - i * 0.01); by.push(cb); ax.push(100 + i * 0.01); ay.push(ca); }
  Q.plot(c(2), [{ x: bx.reverse(), y: by.reverse(), color: P.up, width: 2, fill: true }, { x: ax, y: ay, color: P.dn, width: 2, fill: true }], { ...o, yMin: 0, yfmt: v => (v / 1000).toFixed(1) + 'k', xfmt: v => v.toFixed(2) });
  const cs = [0, 2.5, 5, 7.5, 10, 15, 20], sr = [1.26, 1.04, 0.81, 0.58, 0.36, -0.06, -0.45];
  Q.plot(c(3), [{ x: cs, y: sr, color: '#7e22ce', width: 2, marks: cs.map((x, i) => ({ x, y: sr[i], r: 3 })) }, { x: cs, y: [-0.02, -0.03, -0.04, -0.04, -0.05, -0.06, -0.08], color: P.muted, width: 1.6 }],
    { ...o, hlines: [0], xticks: cs, xfmt: v => v + 'bp', yfmt: v => v.toFixed(1) });
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tiles').innerHTML = TILES.map((t, i) => `
    <a class="tile" href="${t.href}" style="--tc:${t.tc}">
      <canvas id="pv-${i}" aria-hidden="true"></canvas>
      <div class="body"><span class="no">Project ${t.no}</span><h3>${t.title}</h3><p class="muted" style="font:12px var(--mono);margin:-2px 0 10px">${t.stack}</p><p>${t.text}</p>
        <div class="facts">${t.facts.map(([v, l]) => `<span><b>${v}</b> ${l}</span>`).join('')}</div>
        <span class="go">Open project →</span></div></a>`).join('');
  hero(); previews(); Q.onRedraw(() => { hero(); previews(); });
});
})();
