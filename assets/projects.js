/* Project cards and evidence badges. Every claim here was checked by building and running the repo.
   status: ok = reproduced from the repo · part = reproduced with a caveat stated · wip = in progress, not claimed */
window.PROJECTS = [
  {
    id: 'lob', name: 'Low-Latency Limit Order Book Engine', repo: 'LowLatencyLOBEngine', stack: 'C++17 · CMake · ctest',
    blurb: 'A price–time priority matching engine. Price levels sit on integer ticks, and each level holds a FIFO order queue. Cancels are O(1) through an id → iterator index, and events enter through a bounded single-producer/single-consumer (SPSC) ring buffer.',
    claims: [
      ['ok', 'FIFO matching, partial fills, cancels by id and integer-tick levels, covered by ctest.'],
      ['part', '1.6–1.8M events/s on the repo benchmark, a single-price stress workload (4-vCPU cloud VM, -O3).'],
      ['part', 'With randomized multi-level flow (20% cancels) it runs at about 250k events/s, with per-event p99 ≈ 8 µs. The best-price search is a linear scan, and best bid/ask tracking is the next optimization.'],
    ],
    repro: 'cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build\nctest --test-dir build && ./build/benchmark_lob',
    demo: 'lob',
  },
  {
    id: 'dpl', name: 'Derivatives Pricing Library', repo: 'Derivatives-Pricing-Library-C-', stack: 'C++17 · CMake · Python reference checks',
    blurb: 'Pricing engines for European, American, barrier and Asian options: closed-form Black–Scholes, a CRR binomial tree, Monte Carlo (antithetic paths plus a control variate) and finite differences (explicit, implicit and Crank–Nicolson), with analytic Greeks and an implied-vol solver.',
    claims: [
      ['ok', 'Black–Scholes call 10.4506 (S=K=100, r=5%, σ=20%, T=1), matching the Python reference. 7/7 tests pass.'],
      ['ok', 'Benchmarks vs. closed form: binomial(500) error 0.004 in ~135 µs, Crank–Nicolson 200×200 error 0.005 in <1 ms, MC 100k×100 error 0.013.'],
      ['wip', 'SABR module being corrected to the full Hagan (2002) expansion. The demo here already uses the corrected formula.'],
    ],
    repro: 'cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build\nctest --test-dir build && ./build/bench_pricing',
    demo: 'pricer',
  },
  {
    id: 'mm', name: 'Options Market-Making Simulator', repo: 'Options-Market-Making-Simulator-', stack: 'Python · NumPy · pytest',
    blurb: 'Event-driven market-making research: Black–Scholes quoting, fill logic, inventory controls and commission-aware P&L accounting, plus a comparison of inventory-aware quoting against a fixed spread.',
    claims: [], repro: '', demo: 'mm',
  },
  {
    id: 'sa', name: 'Statistical Arbitrage Research', repo: 'Statistical-Arbitrage-Research-', stack: 'Python · statsmodels · pytest',
    blurb: 'A pairs-research pipeline: Engle–Granger and Johansen screening, OLS hedge ratios fit per training window, z-score signals, transaction costs and walk-forward out-of-sample evaluation.',
    claims: [
      ['ok', 'Engle–Granger screening (p ≤ 0.05), OLS hedge ratio fit on each 252-day training window only, then traded on the next 63 days out of sample. 20/20 tests pass.'],
      ['ok', 'Costs: 10 bps per unit change in position. Windows that fail the cointegration test are skipped.'],
      ['wip', 'Real-data run on NSE banking pairs (HDFC, ICICI, Axis, Kotak) and a published out-of-sample results table, coming next. No performance figure is claimed until it is checked in.'],
    ],
    repro: 'pip install -r requirements.txt\nPYTHONPATH=. pytest\nPYTHONPATH=. python scripts/run_banking_pairs.py',
    demo: 'pairs',
  },
];

(() => {
  const label = { ok: 'Verified', part: 'Caveat', wip: 'In progress' };
  const cls = { ok: 'b-ok', part: 'b-part', wip: 'b-wip' };
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const list = document.getElementById('project-list');
  if (list) list.innerHTML = window.PROJECTS.map(p => `
    <article class="proj" id="proj-${p.id}">
      <h3>${esc(p.name)}</h3>
      <p class="stack">${esc(p.stack)}</p>
      <p>${esc(p.blurb)}</p>
      ${p.claims.length ? `<ul class="claims">${p.claims.map(([s, t]) => `<li><span class="badge ${cls[s]}">${label[s]}</span><span>${esc(t)}</span></li>`).join('')}</ul>` : ''}
      ${p.repro ? `<pre class="repro" aria-label="Reproduce">${esc(p.repro)}</pre>` : ''}
      <div class="links">
        <a href="https://github.com/Mj2603/${p.repo}" target="_blank" rel="noopener">Source on GitHub ↗</a>
        <a href="#lab-${p.demo}" data-demo="${p.demo}">Open live demo</a>
      </div>
    </article>`).join('');
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-demo]'); if (!a) return;
    const t = document.getElementById('t-' + a.dataset.demo); if (t) { e.preventDefault(); t.click(); document.getElementById('lab').scrollIntoView({ behavior: 'smooth' }); }
  });
  // short evidence lines under each demo
  const ev = { lob: 'ev-lob', dpl: 'ev-dpl', mm: 'ev-mm', sa: 'ev-sa' };
  window.PROJECTS.forEach(p => {
    const el = document.getElementById(ev[p.id]); if (!el || !p.claims.length) return;
    el.innerHTML = p.claims.map(([s, t]) => `<span class="badge ${cls[s]}">${label[s]}</span>${esc(t)}`).join('<br>');
  });
})();
