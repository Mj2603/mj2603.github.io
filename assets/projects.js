/* Project cards and evidence badges. Every claim here was checked by building and running the repo.
   status: ok = reproduced from the repo · part = reproduced with a caveat stated · wip = in progress, not claimed */
window.PROJECTS = [
  {
    id: 'lob', name: 'Low-Latency Limit Order Book Engine', repo: 'LowLatencyLOBEngine', stack: 'C++17 · CMake · ctest · ASan/UBSan',
    blurb: 'A single-threaded price–time priority matching engine. Integer-tick levels hold FIFO order queues, a two-level occupancy bitmap tracks best bid and ask, cancels are O(1) by id, and events enter through a bounded SPSC ring.',
    claims: [
      ['ok', 'Checked against a std::map reference book by a randomized differential test (36 seeds, 270k operations). Tests also pass under ASan/UBSan.'],
      ['ok', 'Seeded multi-level workload (60% passive adds, 20% marketable, 20% cancels): about 10.9M events/s, per-event p50 89 ns, p99 0.50 µs, p99.9 0.76 µs. Measured on a 4-vCPU cloud VM at -O3; hardware-dependent.'],
      ['ok', 'Bitmap best-price tracking made the randomized workload about 85× faster than the earlier linear scan (126k → 10.8M events/s).'],
    ],
    repro: 'cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build\nctest --test-dir build && ./build/benchmark_lob --workload random --runs 3',
    demo: 'lob',
  },
  {
    id: 'dpl', name: 'Derivatives Pricing Library', repo: 'Derivatives-Pricing-Library-C-', stack: 'C++17 · CMake · Python reference checks',
    blurb: 'Pricing engines for European, American, barrier and Asian options: closed-form Black–Scholes, a CRR binomial tree, Monte Carlo (antithetic paths plus a control variate) and finite differences (explicit, implicit and Crank–Nicolson), with analytic Greeks and an implied-vol solver.',
    claims: [
      ['ok', 'Black–Scholes call 10.4506 (S=K=100, r=5%, σ=20%, T=1), matching the Python reference. 7/7 tests pass.'],
      ['ok', 'Benchmarks vs. closed form: binomial(500) error 0.004 in ~135 µs, Crank–Nicolson 200×200 error 0.005 in <1 ms, MC 100k×100 error 0.013.'],
      ['ok', 'Hagan (2002) SABR implied vol, matched to an independent Python reference to 1e-11. Multi-quote calibration recovers α, ρ, ν to about 1e-6 on a 17-strike smile in about 0.4 ms. 8/8 test suites pass.'],
    ],
    repro: 'cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build\nctest --test-dir build && ./build/bench_pricing',
    demo: 'pricer',
  },
  {
    id: 'mm', name: 'Options Market-Making Simulator', repo: 'Options-Market-Making-Simulator-', stack: 'Python · NumPy · pytest',
    blurb: 'Event-driven market-making research: Black–Scholes quoting, fill logic, inventory controls and commission-aware P&L accounting, plus a comparison of inventory-aware quoting against a fixed spread.',
    claims: [
      ['ok', 'Event-driven trade-print replay: each print fills against the quote left resting by the previous event, with participation caps, inventory limits and commission-aware average-cost P&L. 113 tests pass.'],
      ['ok', 'Avellaneda–Stoikov quoting with k fitted by Poisson maximum likelihood on the training window, compared with a fixed spread in expanding-window walk-forward folds.'],
      ['ok', 'Synthetic walk-forward, 20 seeds per scenario (results committed): with random-walk and informed flow, A–S matches a tuned fixed spread on net P&L (95% CI includes 0), with 26–35% lower P&L dispersion and 22–24% lower peak inventory.'],
      ['part', 'With trending markets, A–S wins 19 of 20 seeds (+85% net P&L), mostly because the tuned fixed spread goes very wide. Its peak inventory is higher there. Real-data replay (options trade prints) is next.'],
    ],
    repro: 'pip install -r requirements.txt && pytest\npython scripts/run_synthetic_experiment.py   # writes results/synthetic_walkforward.md',
    demo: 'mm',
  },
  {
    id: 'sa', name: 'Statistical Arbitrage Research', repo: 'Statistical-Arbitrage-Research-', stack: 'Python · statsmodels · pytest',
    blurb: 'A pairs-research pipeline: Engle–Granger and Johansen screening, OLS hedge ratios fit per training window, z-score signals, transaction costs and walk-forward out-of-sample evaluation.',
    claims: [
      ['ok', 'Walk-forward with no look-ahead: pair selection, hedge ratios and z-score warm-up use training data only. Regression tests show that changing every future price leaves past trades unchanged. 46 tests pass.'],
      ['ok', 'Cost-sensitivity study on simulated data (committed): cointegrated pairs give an OOS Sharpe of 1.06 before costs, 0.40 at 5 bps and −0.29 at 10 bps. Random-walk controls pass the Engle–Granger test in only 7% of windows and earn nothing.'],
      ['wip', 'Real NSE banking-pair results (HDFC/ICICI, 2019 onward) come next. No real-data performance is claimed until those results are committed.'],
    ],
    repro: 'pip install -e ".[dev]" && pytest\npython scripts/run_synthetic_experiment.py   # writes results/synthetic_walkforward.md',
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
