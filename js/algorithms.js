/**
 * algorithms.js - content of the Algorithm Information page.
 * b = branching factor (at most 4 in the 8-puzzle), d = depth of the shallowest goal,
 * m = maximum depth, l = depth limit, C* = optimal solution cost, e = smallest step cost.
 */
(function () {
  'use strict';

  const ALGORITHMS = [
    {
      id: 'bfs', short: 'BFS', name: 'Breadth First Search', type: 'Uninformed',
      description:
        'Explores the state space level by level: all nodes at depth k are expanded before any node at depth k + 1.',
      principle: [
        'Keep the frontier in a FIFO queue.',
        'Remove the oldest node, expand it and append its unseen successors to the back of the queue.',
        'Stop when a goal state is generated.'
      ],
      advantages: ['Always finds a solution if one exists.', 'Finds the shallowest (fewest-move) solution.', 'Simple to implement.'],
      limitations: ['Memory grows exponentially - it must store the whole frontier.', 'Ignores step costs, so with unequal costs the fewest-move path need not be the cheapest.', 'Slow on deep puzzles.'],
      time: 'O(b^d)', space: 'O(b^d)', complete: 'Yes (finite branching factor)', optimal: 'Yes when every step costs the same'
    },
    {
      id: 'dfs', short: 'DFS', name: 'Depth First Search', type: 'Uninformed',
      description:
        'Always expands the deepest node in the frontier, following one branch as far as possible before backtracking.',
      principle: [
        'Keep the frontier in a LIFO stack.',
        'Pop the newest node, expand it and push its successors.',
        'Use an explored set so the search does not loop forever on repeated states.'
      ],
      advantages: ['Very small memory when run as tree search.', 'Can reach a goal quickly if it happens to take the right branch.'],
      limitations: ['Solutions can be extremely long (tens of thousands of moves on the 8-puzzle).', 'Not optimal.', 'Without an explored set it can loop forever.'],
      time: 'O(b^m)', space: 'O(b*m) as tree search; O(states) with an explored set', complete: 'Only with an explored set on a finite state space', optimal: 'No'
    },
    {
      id: 'dls', short: 'DLS', name: 'Depth Limited Search', type: 'Uninformed',
      description: 'Depth-first search that refuses to go deeper than a fixed limit l, which prevents endless descent.',
      principle: [
        'Run DFS but treat nodes at depth l as having no successors.',
        'Return one of: solution found, cutoff (limit hit) or failure.',
        'Choosing l too small misses the goal; too large wastes effort.'
      ],
      advantages: ['Memory is only O(b*l).', 'Never gets lost in an infinitely deep branch.'],
      limitations: ['Incomplete if the limit is smaller than the shallowest goal depth.', 'Not optimal.', 'Needs a good guess for l.'],
      time: 'O(b^l)', space: 'O(b*l)', complete: 'No (if l < d)', optimal: 'No'
    },
    {
      id: 'iddls', short: 'IDDLS', name: 'Iterative Deepening Depth Limited Search', type: 'Uninformed',
      description:
        'Repeats depth limited search with limit 0, 1, 2, ... until a solution is found, combining the low memory of DFS with the completeness of BFS.',
      principle: [
        'For l = 0, 1, 2, ...: run DLS with limit l.',
        'Stop as soon as a pass returns a solution.',
        'Shallow levels are re-generated each pass, but they are cheap compared with the deepest level.'
      ],
      advantages: ['Complete and optimal (equal step costs).', 'Memory of only O(b*d).', 'No need to guess the depth limit.'],
      limitations: ['Repeats work on shallow levels.', 'Still exponential time.', 'Not optimal for unequal step costs.'],
      time: 'O(b^d)', space: 'O(b*d)', complete: 'Yes', optimal: 'Yes when every step costs the same'
    },
    {
      id: 'ucs', short: 'UCS', name: 'Uniform Cost Search', type: 'Uninformed', mine: true,
      description:
        'Expands the frontier node with the lowest path cost g(n) from the start. It is Dijkstra\'s algorithm applied to a state space and works for any positive step costs.',
      principle: [
        'Keep the frontier in a priority queue (min-heap) ordered by g(n).',
        'Pop the cheapest node. If it is the goal, stop - the goal test is done on expansion, which guarantees optimality.',
        'Otherwise expand it; for each successor add it to the frontier, or replace an existing frontier entry if the new path to that state is cheaper.',
        'Move the expanded state to the explored set so it is never expanded again.'
      ],
      advantages: ['Complete and always optimal (lowest total cost).', 'Handles non-uniform step costs, unlike BFS.', 'Needs no heuristic knowledge about the problem.'],
      limitations: ['Explores in every direction - it has no sense of where the goal is.', 'Memory use is exponential, like BFS.', 'With unit step costs it behaves exactly like BFS.'],
      time: 'O(b^(1 + floor(C*/e)))', space: 'O(b^(1 + floor(C*/e)))', complete: 'Yes (if every step cost is at least e > 0)', optimal: 'Yes'
    },
    {
      id: 'gbfs', short: 'GBFS', name: 'Greedy Best First Search', type: 'Informed',
      description:
        'Expands the node that looks closest to the goal according to a heuristic h(n), ignoring the cost already paid.',
      principle: [
        'Keep the frontier in a priority queue ordered by h(n) only (f(n) = h(n)).',
        'Heuristics for the 8-puzzle: Misplaced Tiles (number of tiles out of place) or Manhattan Distance (sum of horizontal + vertical distances of each tile to its goal cell).',
        'Skip states that were already generated.'
      ],
      advantages: ['Often very fast and expands few nodes.', 'Easy to add to any search that has a heuristic.'],
      limitations: ['Not optimal - it can be lured into long detours.', 'Can get stuck at local minima of h.', 'Worst-case time and space are still exponential.'],
      time: 'O(b^m) worst case', space: 'O(b^m) worst case', complete: 'Only with an explored set on a finite space', optimal: 'No'
    },
    {
      id: 'astar', short: 'A*', name: 'A* Search', type: 'Informed',
      description:
        'Expands the node with the lowest estimated total cost f(n) = g(n) + h(n): the cost paid so far plus the heuristic estimate of the cost still to go.',
      principle: [
        'Keep the frontier in a priority queue ordered by f(n) = g(n) + h(n).',
        'If h never overestimates (admissible) and is consistent, the first time the goal is popped the path is optimal.',
        'Both Misplaced Tiles and Manhattan Distance are admissible and consistent; Manhattan dominates (is never smaller), so it expands fewer nodes.'
      ],
      advantages: ['Complete and optimal with an admissible, consistent heuristic.', 'Usually expands far fewer nodes than uninformed search.'],
      limitations: ['Stores every generated node, so memory can be the bottleneck.', 'Quality depends entirely on the heuristic.'],
      time: 'Exponential in the heuristic error', space: 'O(b^d) - all nodes kept in memory', complete: 'Yes', optimal: 'Yes (admissible / consistent h)'
    }
  ];

  const esc = window.escapeHtml;
  const list = (items) => '<ul class="mb-0">' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>';
  const ol = (items) => '<ol class="mb-0">' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ol>';

  function render() {
    const acc = document.getElementById('algoAccordion');
    acc.innerHTML = ALGORITHMS.map((a, idx) => {
      const open = a.mine; // UCS expanded by default
      return (
        '<div class="accordion-item" id="alg-' + a.id + '">' +
        '<h2 class="accordion-header"><button class="accordion-button' + (open ? '' : ' collapsed') + '" type="button" data-bs-toggle="collapse" data-bs-target="#c-' + a.id + '" aria-expanded="' + open + '" aria-controls="c-' + a.id + '">' +
        '<span class="fw-semibold me-2">' + esc(a.short) + '</span> ' + esc(a.name) +
        ' <span class="badge ms-2 ' + (a.type === 'Informed' ? 'text-bg-info' : 'text-bg-secondary') + ' fw-normal">' + a.type + '</span>' +
        (a.mine ? ' <span class="badge badge-soft ms-2">Implemented in this project</span>' : '') +
        '</button></h2>' +
        '<div id="c-' + a.id + '" class="accordion-collapse collapse' + (open ? ' show' : '') + '"><div class="accordion-body">' +
        '<p>' + esc(a.description) + '</p>' +
        '<div class="row g-3">' +
        '<div class="col-md-6"><h3 class="h6">Working principle</h3>' + ol(a.principle) + '</div>' +
        '<div class="col-md-3"><h3 class="h6 text-success">Advantages</h3>' + list(a.advantages) + '</div>' +
        '<div class="col-md-3"><h3 class="h6 text-danger">Limitations</h3>' + list(a.limitations) + '</div>' +
        '</div>' +
        '<div class="row g-2 mt-3">' +
        stat('Time complexity', a.time) + stat('Space complexity', a.space) + stat('Completeness', a.complete) + stat('Optimality', a.optimal) +
        '</div></div></div></div>'
      );
    }).join('');

    document.getElementById('complexityBody').innerHTML = ALGORITHMS.map(
      (a) =>
        '<tr' + (a.mine ? ' class="mine"' : '') + '><td><a href="#alg-' + a.id + '" class="fw-semibold text-decoration-none">' + esc(a.short) + '</a></td>' +
        '<td>' + esc(a.type) + '</td><td>' + esc(a.time) + '</td><td>' + esc(a.space) + '</td><td>' + esc(a.complete) +
        '</td><td>' + esc(a.optimal) + '</td></tr>'
    ).join('');

    // open the accordion section that matches the URL hash (e.g. algorithms.html#alg-astar)
    if (location.hash.indexOf('#alg-') === 0) {
      const id = location.hash.replace('#alg-', '');
      const panel = document.getElementById('c-' + id);
      if (panel && window.bootstrap) {
        new window.bootstrap.Collapse(panel, { toggle: false }).show();
        document.getElementById('alg-' + id).scrollIntoView();
      }
    }
  }

  function stat(lbl, val) {
    return '<div class="col-6 col-lg-3"><div class="stat"><div class="lbl">' + lbl + '</div><div class="fw-semibold">' + esc(val) + '</div></div></div>';
  }

  document.addEventListener('DOMContentLoaded', render);
})();
