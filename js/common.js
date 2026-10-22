/**
 * common.js - shared navigation bar, footer, light/dark theme toggle and
 * localStorage helpers used by every page.
 */
(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};

  /* ---- theme ---- */
  const THEME_KEY = '8puzzle.theme';
  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-bs-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
  }
  document.documentElement.setAttribute('data-bs-theme', getTheme());

  /* ---- navbar ---- */
  const pages = [
    { href: 'index.html', label: 'Home' },
    { href: 'solver.html', label: 'Solver' },
    { href: 'compare.html', label: 'Comparison' },
    { href: 'algorithms.html', label: 'Algorithms' }
  ];

  function buildNav() {
    const host = document.getElementById('site-nav');
    if (!host) return;
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const links = pages
      .map((p) => {
        const active = p.href === current ? ' active" aria-current="page' : '';
        return '<li class="nav-item"><a class="nav-link' + active + '" href="' + p.href + '">' + p.label + '</a></li>';
      })
      .join('');
    host.innerHTML =
      '<nav class="navbar navbar-expand-md app-nav sticky-top">' +
      '<div class="container-xl">' +
      '<a class="navbar-brand fw-bold" href="index.html"><span class="brand-tile">8</span> 8-Puzzle Visualizer</a>' +
      '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu" aria-controls="navMenu" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>' +
      '<div class="collapse navbar-collapse" id="navMenu">' +
      '<ul class="navbar-nav me-auto mb-2 mb-md-0">' + links + '</ul>' +
      '<button id="themeToggle" class="btn btn-sm btn-outline-secondary" type="button"></button>' +
      '</div></div></nav>';
    document.getElementById('themeToggle').addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
    });
    applyTheme(getTheme());
  }

  function buildFooter() {
    const host = document.getElementById('site-footer');
    if (!host) return;
    host.innerHTML =
      '<footer class="app-footer mt-5 py-4"><div class="container-xl small text-body-secondary d-flex flex-wrap justify-content-between gap-2">' +
      '<span>' + esc(CFG.course) + ' &middot; ' + esc(CFG.studentName) + ' (' + esc(CFG.regNo) + ')</span>' +
      '<span>Algorithm: ' + esc(CFG.algorithm) + '</span>' +
      '</div></footer>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---- shared puzzle storage (solver page -> comparison page) ---- */
  const PUZZLE_KEY = '8puzzle.current';
  window.PuzzleStore = {
    load() {
      try {
        const v = JSON.parse(localStorage.getItem(PUZZLE_KEY));
        if (v && Array.isArray(v.initial) && Array.isArray(v.goal)) return v;
      } catch (e) { /* ignore */ }
      return null;
    },
    save(p) {
      try { localStorage.setItem(PUZZLE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    }
  };
  window.escapeHtml = esc;

  document.addEventListener('DOMContentLoaded', () => {
    buildNav();
    buildFooter();
    document.querySelectorAll('[data-cfg]').forEach((el) => {
      const v = CFG[el.getAttribute('data-cfg')];
      if (v != null) el.textContent = v;
    });
  });
})();
