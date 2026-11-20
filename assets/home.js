/* Landing page: hero surface, desk cards with live previews built from the verified project data. */
(() => {
'use strict';
const label = { ok: 'Verified', part: 'Caveat', wip: 'In progress' }, cls = { ok: 'b-ok', part: 'b-part', wip: 'b-wip' };
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const titles = { dpl: 'Volatility desk', mm: 'Market-making desk', lob: 'Order book desk', sa: 'Pairs desk' };
function sabr(F, K, T, a, b, rho, nu) { const omb = 1 - b, l = Math.log(F / K), f = Math.pow(F * K, omb / 2), z = (nu / a) * f * l;
  const zx = Math.abs(z) < 1e-6 ? 1 - 0.5 * rho * z : z / Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  return a / (f * (1 + omb * omb * l * l / 24 + omb ** 4 * l ** 4 / 1920)) * zx * (1 + (omb * omb * a * a / (24 * f * f) + rho * b * nu * a / (4 * f) + (2 - 3 * rho * rho) * nu * nu / 24) * T); }
const vol = (k, t) => sabr(100, k, t, 0.25 * (1 + 0.1 * (Math.sqrt(t) - 1)) * 10, 0.5, -0.35, 0.6 * Math.pow(t, -0.3)) * 100;
function hero() { const ks = Array.from({ length: 25 }, (_, i) => 70 + 2.5 * i), ts = Array.from({ length: 18 }, (_, i) => 0.1 + 1.9 * i / 17);
  Q.surface(document.getElementById('hero-surf'), { xs: ks, ys: ts, z: (i, j) => vol(ks[i], ts[j]) }, { xlabel: 'Strike', ylabel: 'Expiry', zlabel: 'Vol', xfmt: v => v.toFixed(0), yfmt: v => v.toFixed(1) + 'y', zfmt: v => v.toFixed(0) + '%' }); }
function previews() {
  const P = Q.palette();
  const c = id => document.getElementById('pv-' + id); if (!c('dpl')) return;
  const xs = Array.from({ length: 61 }, (_, i) => 70 + i);
  Q.plot(c('dpl'), [0.25, 0.5, 1, 2].map((t, i) => ({ x: xs, y: xs.map(k => vol(k, t)), color: [P.a, P.b, P.c, P.d][i], width: 1.8 })), { noTip: true, padL: 40, yfmt: v => v.toFixed(0) + '%', xfmt: v => v.toFixed(0) });
  // MM thumbnail: normal fits to the desk's default-run results (A–S mean 64.02, sd 6.22; matched fixed mean 67.34, sd 13.13)
  const rng = Q.rng(5), g = Q.gauss(rng), a = [], f = []; for (let i = 0; i < 1500; i++) { a.push(64.02 + 6.22 * g()); f.push(67.34 + 13.13 * g()); }
  const da = Q.kde(a, 20, 110, 90), df = Q.kde(f, 20, 110, 90);
  Q.plot(c('mm'), [{ x: df.xs, y: df.ys, color: P.c, width: 1.6 }, { x: da.xs, y: da.ys, color: P.a, width: 2.2, fill: true }], { noTip: true, padL: 40, yMin: 0, yfmt: () => '', xfmt: v => '$' + v.toFixed(0) });
  const bx = [], by = [], ax = [], ay = []; let cb = 0, ca = 0; for (let i = 1; i <= 25; i++) { cb += 80 + 60 * Math.sin(i * 1.7) ** 2 + i * 6; ca += 70 + 70 * Math.cos(i * 1.3) ** 2 + i * 7; bx.push(100 - i * 0.01); by.push(cb); ax.push(100 + i * 0.01); ay.push(ca); }
  Q.plot(c('lob'), [{ x: bx.reverse(), y: by.reverse(), color: P.up, width: 2, fill: true }, { x: ax, y: ay, color: P.dn, width: 2, fill: true }], { noTip: true, padL: 40, yMin: 0, yfmt: v => (v / 1000).toFixed(1) + 'k', xfmt: v => v.toFixed(2) });
  const cs = [0, 2.5, 5, 7.5, 10, 15, 20];
  Q.plot(c('sa'), [{ x: cs, y: [1.26, 1.04, 0.81, 0.58, 0.36, -0.06, -0.45], color: P.a, width: 2, marks: cs.map((x, i) => ({ x, y: [1.26, 1.04, 0.81, 0.58, 0.36, -0.06, -0.45][i], r: 3 })) },
    { x: cs, y: [-0.02, -0.03, -0.04, -0.04, -0.05, -0.06, -0.08], color: P.dn, width: 1.6 }], { noTip: true, padL: 40, hlines: [0], xticks: cs, xfmt: v => v + 'bp', yfmt: v => v.toFixed(1) });
}
const sub = { dpl: 'SABR smiles by expiry', mm: 'P&L distribution: A–S (blue) vs fixed spread', lob: 'Cumulative book depth', sa: 'Sharpe vs cost: cointegrated vs random-walk control' };
document.addEventListener('DOMContentLoaded', () => {
  const by = Object.fromEntries(window.PROJECTS.map(p => [p.id, p]));
  document.getElementById('desk-cards').innerHTML = window.PROJECT_ORDER.map(id => { const p = by[id]; return `
    <a class="dcard" href="${window.PROJECT_DESK[id]}">
      <canvas id="pv-${id}" aria-label="${esc(sub[id])}" role="img"></canvas>
      <div class="body"><h3>${titles[id]} <span class="muted" style="font-weight:500;font-size:14px">· ${esc(p.name)}</span></h3><p class="stack">${esc(p.stack)}</p><p>${esc(p.blurb)}</p>
      <ul>${p.claims.map(([s, t]) => `<li><span class="badge ${cls[s]}">${label[s]}</span><span>${esc(t)}</span></li>`).join('')}</ul>
      <span class="go">Open the desk →</span></div></a>`; }).join('');
  hero(); previews();
  Q.onRedraw(() => { hero(); previews(); });
});
})();
