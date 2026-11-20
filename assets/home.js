/* Home page: stone-rendered SABR surface and the project list. */
(() => {
'use strict';
const GH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>';
const OUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const P = [
  { page: 'vol.html', repo: 'Derivatives-Pricing-Library-C-', tag: 'Derivatives', title: 'Volatility Surface',
    text: 'SABR pricing and calibration on a full implied-vol surface, with risk-neutral density checks, daily recalibration and option-book scenario risk.',
    res: [['1e-11', 'vs. reference'], ['~0.4 ms', 'per smile fit']], stack: 'C++17 · SABR · Black–Scholes · Monte Carlo' },
  { page: 'mm.html', repo: 'Options-Market-Making-Simulator-', tag: 'Market making', title: 'Inventory-Aware Market Maker',
    text: 'Avellaneda–Stoikov quoting against tuned fixed-spread rules, with event-driven trade-print replay and walk-forward calibration.',
    res: [['26–35%', 'lower P&L dispersion'], ['22–24%', 'lower peak inventory']], stack: 'Python · NumPy · pytest' },
  { page: 'lob.html', repo: 'LowLatencyLOBEngine', tag: 'Exchange systems', title: 'Low-Latency Order Book',
    text: 'Price–time priority matching engine with bitmap best-price tracking, differentially tested against a reference book.',
    res: [['~10M', 'events/s'], ['0.50 µs', 'p99 latency']], stack: 'C++17 · CMake · ASan/UBSan' },
  { page: 'pairs.html', repo: 'Statistical-Arbitrage-Research-', tag: 'Statistical arbitrage', title: 'Cointegration Pairs',
    text: 'Engle–Granger pairs trading with a look-ahead-free walk-forward, cost sensitivity and random-walk controls. NSE banking pairs pending.',
    res: [['1.06', 'Sharpe before costs'], ['46', 'tests']], stack: 'Python · statsmodels · pytest' },
  { page: null, repo: 'chmm-speaker-diarization', tag: 'Prototype', title: 'Conditional HMM Diarization',
    text: 'Conditional hidden Markov model decoder for speaker diarization: input-dependent transitions, Gaussian emissions and Viterbi decoding.',
    res: [], stack: 'Python · NumPy' },
];
function sabr(F, K, T, a, b, rho, nu) { const omb = 1 - b, l = Math.log(F / K), f = Math.pow(F * K, omb / 2), z = (nu / a) * f * l;
  const zx = Math.abs(z) < 1e-6 ? 1 - 0.5 * rho * z : z / Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  return a / (f * (1 + omb * omb * l * l / 24 + omb ** 4 * l ** 4 / 1920)) * zx * (1 + (omb * omb * a * a / (24 * f * f) + rho * b * nu * a / (4 * f) + (2 - 3 * rho * rho) * nu * nu / 24) * T); }
const vol = (k, t) => sabr(100, k, t, 0.25 * (1 + 0.1 * (Math.sqrt(t) - 1)) * 10, 0.5, -0.35, 0.6 * Math.pow(t, -0.3)) * 100;
function hero() {
  const ks = Array.from({ length: 26 }, (_, i) => 70 + 2.4 * i), ts = Array.from({ length: 20 }, (_, i) => 0.1 + 1.9 * i / 19);
  let hj = 0; ts.forEach((t, j) => { if (Math.abs(t - 1) < Math.abs(ts[hj] - 1)) hj = j; });
  Q.surface(document.getElementById('hero-surf'), { xs: ks, ys: ts, z: (i, j) => vol(ks[i], ts[j]) }, { stone: true, bare: true, highlight: hj });
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('plist').innerHTML = P.map((p, i) => {
    const href = p.page || `https://github.com/Mj2603/${p.repo}`, ext = p.page ? '' : ' target="_blank" rel="noopener"';
    return `<article class="pitem"><span class="n">${String(i + 1).padStart(2, '0')}</span><div>
      <div class="hd"><h3><a href="${href}"${ext}>${p.title}</a></h3><span class="tag">${p.tag}</span></div>
      <p>${p.text}</p>
      ${p.res.length ? `<div class="res">${p.res.map(([v, l]) => `<b>${v}</b> ${l}`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <div class="ft"><span>${p.stack}</span><span class="ics"><a href="https://github.com/Mj2603/${p.repo}" target="_blank" rel="noopener" aria-label="${p.title} source on GitHub">${GH}</a>${p.page ? `<a href="${p.page}" aria-label="Open ${p.title}">${OUT}</a>` : ''}</span></div>
    </div></article>`; }).join('');
  hero(); Q.onRedraw(hero);
  // ---- Lorenz attractor, rotating line figure
  const lz = (() => { const pts = []; let x = 0.1, y = 0, z = 0; const dt = 0.006; for (let i = 0; i < 9000; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * dt; y += dy * dt; z += dz * dt; if (i > 300) pts.push([x, y, z - 25]); } return pts; })();
  const cv = document.getElementById('lorenz'); let ang = 0.6;
  const drawL = () => { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const s = Math.min(w, h) / 62, c = Math.cos(ang), sn = Math.sin(ang); g.lineWidth = 0.7; g.strokeStyle = 'rgba(178,74,38,0.75)'; g.beginPath();
    const ct = Math.cos(0.45), st = Math.sin(0.45); lz.forEach(([x, y, z], i) => { const d = x * sn + y * c, X = w / 2 + (x * c - y * sn) * s, Y = h / 2 - (z * ct - d * st) * s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spin = () => { if (!document.hidden && cv.getBoundingClientRect().top < innerHeight) { ang += 0.004; drawL(); } if (!reduce) requestAnimationFrame(spin); };
  drawL(); if (!reduce) requestAnimationFrame(spin); addEventListener('resize', drawL);

  // ---- Jamlist shares the hero audio element
  const jb = document.getElementById('jam-play'), jam = jb.closest('.jam'), au2 = document.getElementById('track-audio');
  const jsync = () => { const on = !au2.paused; jam.classList.toggle('on', on); jb.firstChild.textContent = on ? '❚❚ ' : '▶ '; jb.setAttribute('aria-label', (on ? 'Pause' : 'Play') + ' Dracula'); };
  jb.addEventListener('click', () => { au2.volume = 0.6; au2.paused ? au2.play().catch(() => {}) : au2.pause(); });
  au2.addEventListener('play', jsync); au2.addEventListener('pause', jsync);
  const btn = document.getElementById('track'), au = document.getElementById('track-audio'), prog = document.getElementById('track-prog');
  const sync = () => { const on = !au.paused; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); btn.setAttribute('aria-label', (on ? 'Pause' : 'Play') + ' Dracula'); };
  btn.addEventListener('click', () => { au.volume = 0.6; au.paused ? au.play().catch(() => {}) : au.pause(); });
  au.addEventListener('play', sync); au.addEventListener('pause', sync);
  au.addEventListener('timeupdate', () => { if (au.duration) prog.style.width = (au.currentTime / au.duration * 100).toFixed(1) + '%'; });
});
})();
