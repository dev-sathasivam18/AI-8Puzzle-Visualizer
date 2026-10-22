/**
 * compare.js - Controller for compare.html
 * Runs every algorithm on the same puzzle and fills the comparison table.
 */
(function () {
  'use strict';

  const P = window.Puzzle;
  const B = window.Board;
  const esc = window.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US');

  // order follows the assignment's numbering: 1 BFS, 2 DFS, 3 DLS, 4 IDDLS, 5 UCS, 6 GBFS, 7 A*
  const ROWS = [
    { id: 'bfs', label: 'BFS', type: 'Uninformed' },
    { id: 'dfs', label: 'DFS', type: 'Uninformed' },
    { id: 'dls', label: 'DLS', type: 'Uninformed' },
    { id: 'iddls', label: 'IDDLS', type: 'Uninformed' },
    { id: 'ucs', label: 'UCS', type: 'Uninformed', mine: true },
    { id: 'gbfs', label: 'GBFS', type: 'Informed' },
    { id: 'astar', label: 'A*', type: 'Informed' }
  ];

  let puzzle = { initial: P.EXAMPLE_INITIAL.slice(), goal: P.EXAMPLE_GOAL.slice(), costModel: 'unit' };
  let running = false;

  function runOne(id, opts) {
    if (id === 'ucs') {
      const r = window.UCS.run(puzzle.initial, puzzle.goal, { costModel: opts.costModel, record: false });
      return {
        name: 'UCS', type: 'Uninformed', found: r.found, note: r.found ? '' : r.message,
        generated: r.stats.generated, expanded: r.stats.expanded,
        moves: r.found ? r.stats.moves : null, pathCost: r.found ? r.stats.pathCost : null,
        maxDepth: r.stats.maxDepth, timeMs: r.stats.timeMs,
        peakNodes: r.stats.peakNodes, memoryBytes: r.stats.memoryBytes
      };
    }
    return window.Ref.run(id, puzzle.initial, puzzle.goal, opts);
  }

  /** Run once; if it was quick, repeat twice more and keep the best time (reduces JIT noise). */
  function measure(id, opts) {
    const r = runOne(id, opts);
    if (r.timeMs < 100) {
      for (let i = 0; i < 2; i++) {
        const again = runOne(id, opts);
        if (again.timeMs < r.timeMs) r.timeMs = again.timeMs;
      }
    }
    return r;
  }

  function renderPuzzle() {
    $('cmpInit').innerHTML = '';
    $('cmpGoal').innerHTML = '';
    new B($('cmpInit'), { size: 'sm' }).set(puzzle.initial);
    new B($('cmpGoal'), { size: 'sm' }).set(puzzle.goal);
    const ok = P.isSolvable(puzzle.initial, puzzle.goal);
    $('cmpInfo').innerHTML = ok
      ? '&#10003; Solvable puzzle.'
      : '<span class="text-danger">&#9888; This puzzle is not solvable - no algorithm can succeed.</span>';
  }

  function placeholderRows() {
    $('cmpBody').innerHTML = ROWS.map((r) =>
      '<tr id="row-' + r.id + '"' + (r.mine ? ' class="mine"' : '') + '><td>' + nameCell(r) +
      '</td><td colspan="8" class="text-body-secondary">Not run yet</td></tr>'
    ).join('');
  }

  function nameCell(r) {
    return '<b>' + esc(r.label) + '</b> <span class="badge ' +
      (r.type === 'Informed' ? 'text-bg-info' : 'text-bg-secondary') + ' fw-normal">' + r.type + '</span>' +
      (r.mine ? ' <span class="badge badge-soft">your algorithm</span>' : '');
  }

  function fillRow(r, res, best) {
    const tr = $('row-' + r.id);
    const cls = (key, v) => (res.found && best[key] === v ? ' class="text-end best"' : ' class="text-end"');
    const dash = '<span class="text-body-secondary">&ndash;</span>';
    const foundBadge = res.found
      ? '<span class="badge badge-yes">Yes</span>'
      : '<span class="badge badge-no">No</span>';
    const note = res.note ? '<div class="small text-body-secondary text-wrap" style="max-width:15rem">' + esc(res.note) + '</div>' : '';
    const bar = (v, max) => '<div class="bar"><span style="width:' + (max > 0 ? Math.max(2, (v / max) * 100) : 0) + '%"></span></div>';
    tr.innerHTML =
      '<td>' + nameCell(r) + '</td>' +
      '<td>' + foundBadge + note + '</td>' +
      '<td class="text-end">' + fmt(res.generated) + '</td>' +
      '<td' + cls('expanded', res.expanded) + '>' + fmt(res.expanded) + bar(res.expanded, best.maxExpanded) + '</td>' +
      '<td' + cls('moves', res.moves) + '>' + (res.found ? fmt(res.moves) : dash) + '</td>' +
      '<td' + cls('cost', res.pathCost) + '>' + (res.found ? fmt(res.pathCost) : dash) + '</td>' +
      '<td class="text-end">' + fmt(res.maxDepth) + '</td>' +
      '<td' + cls('time', res.timeMs) + '>' + (res.timeMs < 10 ? res.timeMs.toFixed(2) : res.timeMs.toFixed(1)) + ' ms' + bar(res.timeMs, best.maxTime) + '</td>' +
      '<td>' + P.formatBytes(res.memoryBytes) + ' <span class="text-body-secondary">&middot; ' + P.memoryLabel(res.memoryBytes) + '</span></td>';
  }

  function computeBest(results) {
    const found = results.filter((r) => r.found);
    const min = (k) => (found.length ? Math.min.apply(null, found.map((r) => r[k])) : null);
    return {
      expanded: min('expanded'),
      moves: min('moves'),
      cost: min('pathCost'),
      time: min('timeMs'),
      maxExpanded: Math.max.apply(null, results.map((r) => r.expanded)),
      maxTime: Math.max.apply(null, results.map((r) => r.timeMs))
    };
  }

  function runAll() {
    if (running) return;
    const costModel = $('cmpCost').value;
    const heuristic = $('cmpHeur').value;
    let dlsLimit = parseInt($('cmpLimit').value, 10);
    if (!(dlsLimit >= 1)) dlsLimit = 10;
    $('cmpLimit').value = dlsLimit;
    puzzle.costModel = costModel;
    window.PuzzleStore.save(puzzle);

    $('cmpAlert').innerHTML = '';
    if (!P.isSolvable(puzzle.initial, puzzle.goal)) {
      $('cmpAlert').innerHTML =
        '<div class="alert alert-danger">This puzzle is not solvable (inversion parity differs), so no algorithm can reach the goal. Load another puzzle.</div>';
      placeholderRows();
      return;
    }

    running = true;
    $('cmpRun').disabled = true;
    $('cmpRun').textContent = 'Running…';
    placeholderRows();
    const opts = { costModel: costModel, heuristic: heuristic, dlsLimit: dlsLimit };
    const results = [];

    let i = 0;
    (function next() {
      if (i >= ROWS.length) {
        // final pass: highlight the best values and draw bars relative to the maxima
        const best = computeBest(results);
        ROWS.forEach((r, idx) => fillRow(r, results[idx], best));
        running = false;
        $('cmpRun').disabled = false;
        $('cmpRun').innerHTML = '&#9654; Run comparison';
        return;
      }
      const r = ROWS[i];
      $('row-' + r.id).innerHTML =
        '<td>' + nameCell(r) + '</td><td colspan="8"><span class="spinner-border spinner-border-sm me-2"></span>Running…</td>';
      setTimeout(() => {
        const res = measure(r.id, opts);
        results.push(res);
        const partial = computeBest(results);
        fillRow(r, res, partial);
        i++;
        next();
      }, 20);
    })();
  }

  function init() {
    const saved = window.PuzzleStore.load();
    if (saved && !P.validate(saved.initial) && !P.validate(saved.goal)) {
      puzzle = { initial: saved.initial.slice(), goal: saved.goal.slice(), costModel: saved.costModel === 'tile' ? 'tile' : 'unit' };
    }
    $('cmpCost').value = puzzle.costModel;
    renderPuzzle();
    placeholderRows();

    $('cmpRun').addEventListener('click', runAll);
    $('cmpRandom').addEventListener('click', () => {
      puzzle.initial = P.randomPuzzle(puzzle.goal, $('cmpDifficulty').value);
      window.PuzzleStore.save(puzzle);
      renderPuzzle();
      runAll();
    });
    runAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
