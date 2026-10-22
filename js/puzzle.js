/**
 * puzzle.js - The 8-Puzzle as a state-space search problem.
 *
 * State      : array of 9 numbers in row-major order, 0 = the blank tile.
 *              Inside the search engines a state is packed into one integer
 *              ("key"), e.g. [2,8,3,1,6,4,7,0,5] -> 283164705.
 * Actions    : slide the blank Up / Down / Left / Right (when it stays on the board).
 * Step cost  : 'unit' -> every move costs 1
 *              'tile' -> moving tile n costs n   (makes UCS differ from BFS)
 * Goal test  : state === goal state.
 */
(function (root) {
  'use strict';

  const CELLS = 9;
  const BYTES_PER_NODE = 64; // rough size of one stored search node (for the memory estimate)

  // The example from the assignment sheet.
  const EXAMPLE_INITIAL = [2, 8, 3, 1, 6, 4, 7, 0, 5];
  const EXAMPLE_GOAL = [1, 2, 3, 8, 0, 4, 7, 6, 5];

  // Operators are named after the direction the BLANK moves.
  const DIRS = [
    { name: 'Up', arrow: '↑', dr: -1, dc: 0 },
    { name: 'Down', arrow: '↓', dr: 1, dc: 0 },
    { name: 'Left', arrow: '←', dr: 0, dc: -1 },
    { name: 'Right', arrow: '→', dr: 0, dc: 1 }
  ];

  // NEIGHBOURS[b] = legal blank moves when the blank sits at index b.
  const NEIGHBOURS = [];
  for (let b = 0; b < CELLS; b++) {
    const r = Math.floor(b / 3);
    const c = b % 3;
    const list = [];
    DIRS.forEach((d) => {
      const nr = r + d.dr;
      const nc = c + d.dc;
      if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3) {
        list.push({ dir: d.name, arrow: d.arrow, to: nr * 3 + nc });
      }
    });
    NEIGHBOURS.push(list);
  }

  /* ---------- state encoding ---------- */

  function keyOf(arr) {
    let k = 0;
    for (let i = 0; i < CELLS; i++) k = k * 10 + arr[i];
    return k;
  }

  function arrOf(key) {
    const a = new Array(CELLS);
    for (let i = CELLS - 1; i >= 0; i--) {
      const d = key % 10;
      a[i] = d;
      key = (key - d) / 10;
    }
    return a;
  }

  /* ---------- validation / solvability ---------- */

  /** Returns an error message, or null if `arr` is a valid 8-puzzle board. */
  function validate(arr) {
    if (!Array.isArray(arr) || arr.length !== CELLS) return 'The board must have exactly 9 cells.';
    const seen = new Set();
    for (const v of arr) {
      if (!Number.isInteger(v) || v < 0 || v > 8) {
        return 'Use only the digits 1-8 and one blank (_ or 0).';
      }
      if (seen.has(v)) return 'Every tile 1-8 and the blank must appear exactly once.';
      seen.add(v);
    }
    return null;
  }

  function inversions(arr) {
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      if (arr[i] === 0) continue;
      for (let j = i + 1; j < CELLS; j++) {
        if (arr[j] !== 0 && arr[i] > arr[j]) n++;
      }
    }
    return n;
  }

  /** On a 3x3 board, goal is reachable iff both boards have the same inversion parity. */
  function isSolvable(initial, goal) {
    return inversions(initial) % 2 === inversions(goal) % 2;
  }

  /* ---------- successor function ---------- */

  /**
   * All legal successors of a state.
   * Returns [{ key, dir, arrow, tile, cost }]  (tile = the tile that slides into the blank).
   */
  function expand(key, costModel) {
    const a = arrOf(key);
    const b = a.indexOf(0);
    const nb = NEIGHBOURS[b];
    const out = [];
    for (let i = 0; i < nb.length; i++) {
      const to = nb[i].to;
      const tile = a[to];
      a[b] = tile;
      a[to] = 0;
      const k = keyOf(a);
      a[to] = tile;
      a[b] = 0;
      out.push({
        key: k,
        dir: nb[i].dir,
        arrow: nb[i].arrow,
        tile: tile,
        cost: costModel === 'tile' ? tile : 1
      });
    }
    return out;
  }

  /* ---------- random puzzles ---------- */

  function scramble(goal, moves) {
    const a = goal.slice();
    let prevBlank = -1;
    for (let i = 0; i < moves; i++) {
      const b = a.indexOf(0);
      const options = NEIGHBOURS[b].filter((n) => n.to !== prevBlank);
      const pick = options[Math.floor(Math.random() * options.length)];
      a[b] = a[pick.to];
      a[pick.to] = 0;
      prevBlank = b;
    }
    return a;
  }

  function shuffled() {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Generate a random SOLVABLE start state for the given goal.
   * difficulty: 'easy' (~7 random moves), 'medium' (~15), 'hard' (uniformly random solvable board)
   */
  function randomPuzzle(goal, difficulty) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let s;
      if (difficulty === 'easy') s = scramble(goal, 6 + Math.floor(Math.random() * 3));
      else if (difficulty === 'medium') s = scramble(goal, 14 + Math.floor(Math.random() * 3));
      else {
        s = shuffled();
        if (!isSolvable(s, goal)) continue;
      }
      if (keyOf(s) !== keyOf(goal)) return s;
    }
    return scramble(goal, 10);
  }

  /* ---------- heuristics (used by GBFS / A* on the comparison page) ---------- */

  const HEURISTICS = {
    manhattan: 'Manhattan Distance',
    misplaced: 'Misplaced Tiles'
  };

  /** Returns a function h(key) for the chosen heuristic and goal. */
  function makeHeuristic(name, goalArr) {
    const goalPos = new Array(CELLS);
    goalArr.forEach((tile, idx) => { goalPos[tile] = idx; });

    if (name === 'misplaced') {
      return function (key) {
        const a = arrOf(key);
        let n = 0;
        for (let i = 0; i < CELLS; i++) {
          if (a[i] !== 0 && a[i] !== goalArr[i]) n++;
        }
        return n;
      };
    }
    return function (key) {
      const a = arrOf(key);
      let d = 0;
      for (let i = 0; i < CELLS; i++) {
        const t = a[i];
        if (t === 0) continue;
        const p = goalPos[t];
        d += Math.abs(Math.floor(i / 3) - Math.floor(p / 3)) + Math.abs((i % 3) - (p % 3));
      }
      return d;
    };
  }

  /* ---------- misc helpers ---------- */

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function memoryLabel(bytes) {
    if (bytes < 50 * 1024) return 'Low';
    if (bytes < 1024 * 1024) return 'Medium';
    return 'High';
  }

  root.Puzzle = {
    CELLS,
    BYTES_PER_NODE,
    EXAMPLE_INITIAL,
    EXAMPLE_GOAL,
    DIRS,
    NEIGHBOURS,
    HEURISTICS,
    keyOf,
    arrOf,
    validate,
    inversions,
    isSolvable,
    expand,
    randomPuzzle,
    makeHeuristic,
    now,
    formatBytes,
    memoryLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
