/* Order book desk: price–time priority book with best-price tracking, live flow, depth, microstructure stats.
   Mirrors LowLatencyLOBEngine (integer ticks, FIFO per level, O(1) cancel by id, best bid/ask tracking). */
(() => {
'use strict';
const { $, num, fmt, signed } = Q;

class Book {
  constructor() { this.lv = { B: new Map(), S: new Map() }; this.best = { B: null, S: null }; this.idx = new Map(); this.live = []; this.pos = new Map(); this.next = 1; this.trades = []; this.stats = { adds: 0, cancels: 0, mkts: 0, fills: 0, vol: 0 }; }
  refreshBest(s, from) { // walk outward from the old best (levels are dense near the touch); fall back to a scan
    const m = this.lv[s]; if (!m.size) { this.best[s] = null; return; }
    const dir = s === 'B' ? -1 : 1; for (let p = from + dir, k = 0; k < 256; p += dir, k++) if (m.has(p)) { this.best[s] = p; return; }
    let b = null; for (const p of m.keys()) if (b === null || (s === 'B' ? p > b : p < b)) b = p; this.best[s] = b; }
  track(o) { this.pos.set(o.id, this.live.length); this.live.push(o.id); }
  untrack(id) { const i = this.pos.get(id), last = this.live.pop(); if (last !== id) { this.live[i] = last; this.pos.set(last, i); } this.pos.delete(id); }
  add(side, px, qty, type = 'L', mine = false) {
    const id = this.next++, opp = side === 'B' ? 'S' : 'B'; let rem = qty; const fills = [];
    while (rem > 0 && this.best[opp] !== null) {
      const bp = this.best[opp]; if (type === 'L' && (side === 'B' ? bp > px : bp < px)) break;
      const q = this.lv[opp].get(bp);
      while (rem > 0 && q.length) { const o = q[0], f = Math.min(rem, o.qty); o.qty -= f; rem -= f; fills.push({ px: bp, qty: f, maker: o.id, taker: id, side, mine: o.mine || mine });
        if (!o.qty) { q.shift(); this.idx.delete(o.id); this.untrack(o.id); } }
      if (!q.length) { this.lv[opp].delete(bp); this.refreshBest(opp, bp); }
    }
    if (rem > 0 && type === 'L') { const m = this.lv[side]; if (!m.has(px)) m.set(px, []); const o = { id, qty: rem, side, px, mine }; m.get(px).push(o); this.idx.set(id, o); this.track(o);
      if (this.best[side] === null || (side === 'B' ? px > this.best[side] : px < this.best[side])) this.best[side] = px; this.stats.adds++; }
    if (type === 'M') this.stats.mkts++;
    fills.forEach(f => { this.trades.unshift(f); this.stats.fills++; this.stats.vol += f.qty; }); if (this.trades.length > 400) this.trades.length = 400;
    return { id, fills, rested: type === 'L' ? rem : 0 };
  }
  cancel(id) { const o = this.idx.get(id); if (!o) return false; const q = this.lv[o.side].get(o.px); q.splice(q.indexOf(o), 1); if (!q.length) { this.lv[o.side].delete(o.px); if (this.best[o.side] === o.px) this.refreshBest(o.side, o.px); } this.idx.delete(id); this.untrack(id); this.stats.cancels++; return true; }
  depth(s, n) { return [...this.lv[s].entries()].sort((a, b) => s === 'B' ? b[0] - a[0] : a[0] - b[0]).slice(0, n).map(([px, q]) => ({ px, qty: q.reduce((a, o) => a + o.qty, 0), q })); }
}
let book, rng, gauss, timer = null, events = 0, hist = { t: [], mid: [], micro: [], spread: [], imb: [] }, mine = [];
const tick = 0.01, T = t => (t * tick).toFixed(2);
function reset() {
  book = new Book(); rng = Q.rng(parseInt($('#l-seed').value, 10) || 7); gauss = Q.gauss(rng); events = 0; hist = { t: [], mid: [], micro: [], spread: [], imb: [] }; mine = [];
  for (let i = 1; i <= 10; i++) for (let j = 0; j < 3; j++) { book.add('B', 10000 - i, 20 + Math.floor(rng() * 120)); book.add('S', 10000 + i, 20 + Math.floor(rng() * 120)); }
  book.trades = []; book.stats = { adds: 0, cancels: 0, mkts: 0, fills: 0, vol: 0 };
}
function flowStep() {
  const pc = num('l-cancel') / 100, pm = num('l-mkt') / 100, width = num('l-width'), drift = num('l-imb') / 100;
  const bb = book.best.B ?? 9990, ba = book.best.S ?? 10010, mid = (bb + ba) / 2, u = rng();
  if (u < pc && book.live.length > 30) { book.cancel(book.live[Math.floor(rng() * book.live.length)]); }
  else if (u < pc + pm) { book.add(rng() < 0.5 + drift ? 'B' : 'S', 0, 30 + Math.floor(rng() * 220), 'M'); }
  else { const s = rng() < 0.5 ? 'B' : 'S', off = Math.max(1, Math.round(Math.abs(gauss()) * width)); book.add(s, s === 'B' ? Math.floor(mid) - off + 1 : Math.ceil(mid) + off - 1, 10 + Math.floor(rng() * 100)); }
  events++;
}
function snap() {
  const bb = book.best.B, ba = book.best.S; if (bb === null || ba === null) return;
  const qb = book.lv.B.get(bb).reduce((a, o) => a + o.qty, 0), qa = book.lv.S.get(ba).reduce((a, o) => a + o.qty, 0);
  const imb = (qb - qa) / (qb + qa), micro = (ba * qb + bb * qa) / (qb + qa);
  hist.t.push(events); hist.mid.push((bb + ba) / 2 * tick); hist.micro.push(micro * tick); hist.spread.push((ba - bb)); hist.imb.push(imb);
  if (hist.t.length > 600) Object.keys(hist).forEach(k => hist[k].shift());
}
function render() {
  const asks = book.depth('S', 10).reverse(), bids = book.depth('B', 10), maxQ = Math.max(1, ...[...asks, ...bids].map(l => l.qty));
  const row = (l, s) => { const chips = l.q.slice(0, 7).map(o => `<span class="chip${o.mine ? ' mine' : ''}" title="order #${o.id}">#${o.id}·${o.qty}</span>`).join('') + (l.q.length > 7 ? `<span class="chip">+${l.q.length - 7}</span>` : '');
    return `<div class="lvl ${s}"><span class="bar" style="width:${(l.qty / maxQ * 100).toFixed(1)}%"></span><span class="px">${T(l.px)}</span><span>${l.qty}</span><span class="queue">${chips}</span></div>`; };
  const bb = book.best.B, ba = book.best.S;
  $('#ladder').innerHTML = asks.map(l => row(l, 'ask')).join('') + `<div class="mid">spread ${bb !== null && ba !== null ? (ba - bb) + ' tick' + (ba - bb > 1 ? 's' : '') : '—'} · mid ${bb !== null && ba !== null ? ((bb + ba) / 2 * tick).toFixed(3) : '—'}</div>` + bids.map(l => row(l, 'bid')).join('');
  $('#tape').innerHTML = book.trades.slice(0, 40).map(t => `<li><span class="${t.side === 'B' ? 'up' : 'dn'}">${t.side === 'B' ? 'BUY' : 'SELL'}</span><span>${t.qty} @ ${T(t.px)}${t.mine ? ' <span class="badge b-part">you</span>' : ''}</span><span class="muted">#${t.maker}←#${t.taker}</span></li>`).join('') || '<li class="muted"><span></span><span>No trades yet</span><span></span></li>';
  // strip + kpis
  $('#st-bb').textContent = bb !== null ? T(bb) : '—'; $('#st-ba').textContent = ba !== null ? T(ba) : '—';
  $('#st-ev').textContent = events.toLocaleString(); $('#st-live').textContent = book.idx.size.toLocaleString(); $('#st-lv').textContent = book.lv.B.size + ' / ' + book.lv.S.size;
  const s = book.stats; $('#k-fills').textContent = s.fills.toLocaleString(); $('#k-fills-s').textContent = `${s.vol.toLocaleString()} shares · ${s.mkts} market orders`;
  $('#k-ratio').textContent = s.fills ? fmt(s.cancels / Math.max(1, s.fills), 2) : '—';
  const last = hist.imb.length ? hist.imb[hist.imb.length - 1] : NaN; $('#k-imb').textContent = signed(last, 2); $('#k-imb').className = 'v ' + (last >= 0 ? 'pos' : 'neg');
  $('#k-spread').textContent = hist.spread.length ? fmt(Q.mean(hist.spread), 2) + ' ticks' : '—';
  // depth chart
  const P_ = Q.palette(), db = book.depth('B', 40), da = book.depth('S', 40); let c = 0; const bx = [], by = [], ax = [], ay = [];
  db.forEach(l => { c += l.qty; bx.push(l.px * tick); by.push(c); }); c = 0; da.forEach(l => { c += l.qty; ax.push(l.px * tick); ay.push(c); });
  if (bx.length && ax.length) Q.plot($('#depth'), [{ x: bx.reverse(), y: by.reverse(), color: P_.up, width: 2, fill: true, label: 'Bid depth' }, { x: ax, y: ay, color: P_.dn, width: 2, fill: true, label: 'Ask depth' }], { xlabel: 'Price', yfmt: v => fmt(v, 0), xfmt: v => v.toFixed(2), yMin: 0 });
  if (hist.t.length > 2) {
    Q.plot($('#midc'), [{ x: hist.t, y: hist.mid, color: P_.ink, width: 1.4, label: 'Mid' }, { x: hist.t, y: hist.micro, color: P_.a, width: 1.6, label: 'Micro-price' }], { xfmt: v => fmt(v, 0), yfmt: v => v.toFixed(3) });
    Q.plot($('#imbc'), [{ x: hist.t, y: hist.imb, color: P_.d, width: 1.4, label: 'L1 imbalance' }], { hlines: [0], xfmt: v => fmt(v, 0), yfmt: v => v.toFixed(1), yMin: -1, yMax: 1 });
  }
  $('#mine').innerHTML = mine.length ? mine.map(id => { const o = book.idx.get(id); return o ? `<li><span class="${o.side === 'B' ? 'up' : 'dn'}">${o.side === 'B' ? 'BID' : 'ASK'}</span><span>#${id} · ${o.qty} @ ${T(o.px)} · queue pos ${book.lv[o.side].get(o.px).indexOf(o) + 1}</span><button class="btn ghost" data-cx="${id}" type="button" style="padding:2px 8px">Cancel</button></li>` : ''; }).join('') : '<li class="muted"><span></span><span>No resting orders. Send a limit order from the panel.</span><span></span></li>';
}
function bench() {
  const b = $('#l-bench'); Q.busy(b, true);
  setTimeout(() => {
    const saved = [book, rng, gauss, events, hist, mine]; reset(); const n = 200000, t0 = performance.now();
    for (let i = 0; i < n; i++) flowStep();
    const ms = performance.now() - t0; $('#k-js').textContent = fmt(n / ms * 1000 / 1e6, 2) + 'M/s'; $('#k-js-s').textContent = `${n.toLocaleString()} events in ${fmt(ms, 0)} ms · JavaScript in your browser`;
    [book, rng, gauss, events, hist, mine] = saved; Q.busy(b, false); render();
  }, 20);
}
document.addEventListener('DOMContentLoaded', () => {
  reset(); snap(); render();
  Q.bind(['l-cancel', 'l-mkt', 'l-width', 'l-imb', 'l-speed'], () => {});
  const play = () => { $('#l-play').textContent = 'Pause'; $('#l-state').className = 'live'; $('#l-state').textContent = 'LIVE FLOW';
    timer = setInterval(() => { if (document.hidden) return; const k = parseInt($('#l-speed').value, 10); for (let i = 0; i < k; i++) { flowStep(); if (i % Math.max(1, Math.floor(k / 4)) === 0) snap(); } render(); }, 100); };
  const stop = () => { clearInterval(timer); timer = null; $('#l-play').textContent = 'Resume'; $('#l-state').className = 'live off'; $('#l-state').textContent = 'PAUSED'; };
  $('#l-play').addEventListener('click', () => timer ? stop() : play());
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play(); else stop();
  $('#l-step').addEventListener('click', () => { flowStep(); snap(); render(); });
  $('#l-reset').addEventListener('click', () => { reset(); snap(); render(); });
  $('#l-bench').addEventListener('click', bench);
  $('#order').addEventListener('submit', e => { e.preventDefault();
    const side = $('#o-side').value, type = $('#o-type').value, px = Math.round(parseFloat($('#o-px').value) / tick), qty = parseInt($('#o-qty').value, 10);
    if (!(qty > 0) || (type === 'L' && !(px > 0))) { $('#o-msg').textContent = 'Enter a positive quantity and price.'; return; }
    const r = book.add(side, px, qty, type, true); events++; if (r.rested) mine.push(r.id); snap();
    $('#o-msg').textContent = `#${r.id}: filled ${r.fills.reduce((a, f) => a + f.qty, 0)} across ${new Set(r.fills.map(f => f.px)).size} level(s)` + (type === 'L' ? `, rested ${r.rested}` : '') + '.'; render(); });
  $('#mine').addEventListener('click', e => { const b = e.target.closest('[data-cx]'); if (!b) return; book.cancel(+b.dataset.cx); events++; mine = mine.filter(x => x !== +b.dataset.cx); render(); });
  Q.onRedraw(render);
});
})();
