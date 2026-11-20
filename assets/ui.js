(() => {
  // Tabs (keyboard accessible)
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = t => {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
    window.dispatchEvent(new Event('resize')); // canvases in a newly shown panel need a size
    try { history.replaceState(null, '', '#' + t.id.replace('t-', 'lab-')); } catch (e) {}
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); select(n); }
    });
  });
  const m = location.hash.match(/^#lab-(\w+)/);
  if (m) { const t = document.getElementById('t-' + m[1]); if (t) { select(t); document.getElementById('lab').scrollIntoView(); } }

  // Theme toggle
  const btn = document.getElementById('theme');
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    document.dispatchEvent(new Event('themechange'));
  });
})();
