/**
 * reference-algorithms.js - compact reference implementations of the OTHER search
 * algorithms (BFS, DFS, DLS, IDDLS, GBFS, A*).
 *
 * They are used ONLY by the Comparison page, so that every algorithm can be benchmarked on
 * the same puzzle instance. They are intentionally small, are NOT visualised, and are not
 * the student's assigned algorithm (that is Uniform Cost Search in js/ucs.js).
 *
 * Every function returns the same result shape:
 *   { name, type, found, note, generated, expanded, moves, pathCost, maxDepth,
 *     timeMs, peakNodes, memoryBytes }
 *
 * Counting conventions are identical to ucs.js: the goal node is tested, not expanded.
 */
(function (root) {
  'use strict';

  const P = root.Puzzle;

  function base(name, type) {
    return {
      name: name, type: type, found: false, note: '',
      generated: 1, expanded: 0, moves: null, pathCost: null, maxDepth: 0,
      timeMs: 0, peakNodes: 0, memoryBytes: 0
    };
  }

  function finish(res, t0, peak) {
    res.timeMs = P.now() - t0;
    res.peakNodes = peak;
    res.memoryBytes = peak * P.BYTES_PER_NODE;
    return res;
  }

  /* ---------------- BFS (graph search, goal test on generation) ---------------- */
  function bfs(init, goal, o) {
    const t0 = P.now();
    const res = base('BFS', 'Uninformed');
    const ik = P.keyOf(init);
    const gk = P.keyOf(goal);
    if (ik === gk) { res.found = true; res.moves = 0; res.pathCost = 0; return finish(res, t0, 1); }

    const key = [ik], g = [0], depth = [0];
    const seen = new Set([ik]);
    const queue = [0];
    let head = 0;
    let peak = 1;
    outer:
    while (head < queue.length) {
      const id = queue[head++];
      res.expanded++;
      const succ = P.expand(key[id], o.costModel);
      for (let i = 0; i < succ.length; i++) {
        const s = succ[i];
        res.generated++;
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        const cid = key.length;
        key.push(s.key); g.push(g[id] + s.cost); depth.push(depth[id] + 1);
        if (depth[cid] > res.maxDepth) res.maxDepth = depth[cid];
        if (s.key === gk) {
          res.found = true; res.moves = depth[cid]; res.pathCost = g[cid];
          break outer;
        }
        queue.push(cid);
      }
      if (seen.size > peak) peak = seen.size;
    }
    if (!res.found) res.note = 'Frontier exhausted';
    return finish(res, t0, Math.max(peak, seen.size));
  }

  /* ---------------- DFS (graph search with explored set, goal test on pop) ---------------- */
  function dfs(init, goal, o) {
    const t0 = P.now();
    const res = base('DFS', 'Uninformed');
    const ik = P.keyOf(init);
    const gk = P.keyOf(goal);
    const key = [ik], g = [0], depth = [0];
    const stack = [0];
    const closed = new Set();
    let peak = 1;
    while (stack.length > 0) {
      const id = stack.pop();
      const k = key[id];
      if (closed.has(k)) continue;
      if (k === gk) { res.found = true; res.moves = depth[id]; res.pathCost = g[id]; break; }
      closed.add(k);
      res.expanded++;
      const succ = P.expand(k, o.costModel);
      for (let i = succ.length - 1; i >= 0; i--) { // reversed so 'Up' is explored first
        const s = succ[i];
        res.generated++;
        if (closed.has(s.key)) continue;
        const cid = key.length;
        key.push(s.key); g.push(g[id] + s.cost); depth.push(depth[id] + 1);
        if (depth[cid] > res.maxDepth) res.maxDepth = depth[cid];
        stack.push(cid);
      }
      const live = stack.length + closed.size;
      if (live > peak) peak = live;
    }
    if (!res.found) res.note = 'Frontier exhausted';
    return finish(res, t0, peak);
  }

  /* ---------------- DLS / IDDLS (tree search, only loops on the current path are cut) ---------------- */
  /** One depth-limited pass. Returns 'found' | 'cutoff' | 'failure' | 'budget'. */
  function dlsPass(init, goal, limit, o, res) {
    const ik = P.keyOf(init);
    const gk = P.keyOf(goal);
    const onPath = new Set([ik]);

    function rec(k, depth, g) {
      if (k === gk) { res.moves = depth; res.pathCost = g; return 'found'; }
      if (depth === limit) return 'cutoff';
      if (res.expanded >= o.budget) return 'budget';
      res.expanded++;
      let cut = false;
      const succ = P.expand(k, o.costModel);
      for (let i = 0; i < succ.length; i++) {
        const s = succ[i];
        res.generated++;
        if (onPath.has(s.key)) continue;
        if (depth + 1 > res.maxDepth) res.maxDepth = depth + 1;
        onPath.add(s.key);
        const r = rec(s.key, depth + 1, g + s.cost);
        onPath.delete(s.key);
        if (r === 'found' || r === 'budget') return r;
        if (r === 'cutoff') cut = true;
      }
      return cut ? 'cutoff' : 'failure';
    }
    return rec(ik, 0, 0);
  }

  function dls(init, goal, o) {
    const t0 = P.now();
    const res = base('DLS', 'Uninformed');
    const r = dlsPass(init, goal, o.dlsLimit, o, res);
    res.found = r === 'found';
    if (r === 'cutoff') res.note = 'Depth limit ' + o.dlsLimit + ' reached before the goal';
    else if (r === 'budget') res.note = 'Stopped: node budget exceeded';
    else if (r === 'failure') res.note = 'Search space exhausted';
    else res.note = 'Limit ' + o.dlsLimit;
    return finish(res, t0, o.dlsLimit + 1); // memory = one path
  }

  function iddls(init, goal, o) {
    const t0 = P.now();
    const res = base('IDDLS', 'Uninformed');
    let last = 'cutoff';
    let limit = 0;
    for (; limit <= o.maxIdLimit; limit++) {
      last = dlsPass(init, goal, limit, o, res);
      if (last !== 'cutoff') break;
    }
    res.found = last === 'found';
    if (res.found) res.note = 'Found at depth limit ' + limit;
    else if (last === 'budget') res.note = 'Stopped: node budget exceeded (limit reached ' + limit + ')';
    else res.note = 'No solution up to limit ' + o.maxIdLimit;
    return finish(res, t0, Math.min(limit, o.maxIdLimit) + 1);
  }

  /* ---------------- GBFS (orders the frontier by h(n) only) ---------------- */
  function gbfs(init, goal, o) {
    const t0 = P.now();
    const res = base('GBFS', 'Informed');
    const ik = P.keyOf(init);
    const gk = P.keyOf(goal);
    const h = P.makeHeuristic(o.heuristic, goal);

    const key = [ik], g = [0], depth = [0], hv = [h(ik)];
    const heap = new root.MinHeap((a, b) => hv[a] < hv[b] || (hv[a] === hv[b] && a < b));
    const seen = new Set([ik]);
    heap.push(0);
    while (heap.size > 0) {
      const id = heap.pop();
      if (key[id] === gk) { res.found = true; res.moves = depth[id]; res.pathCost = g[id]; break; }
      res.expanded++;
      const succ = P.expand(key[id], o.costModel);
      for (let i = 0; i < succ.length; i++) {
        const s = succ[i];
        res.generated++;
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        const cid = key.length;
        key.push(s.key); g.push(g[id] + s.cost); depth.push(depth[id] + 1); hv.push(h(s.key));
        if (depth[cid] > res.maxDepth) res.maxDepth = depth[cid];
        heap.push(cid);
      }
    }
    if (!res.found) res.note = 'Frontier exhausted';
    return finish(res, t0, seen.size);
  }

  /* ---------------- A* (orders the frontier by f(n) = g(n) + h(n)) ---------------- */
  function astar(init, goal, o) {
    const t0 = P.now();
    const res = base('A*', 'Informed');
    const ik = P.keyOf(init);
    const gk = P.keyOf(goal);
    const h = P.makeHeuristic(o.heuristic, goal);

    const key = [ik], g = [0], depth = [0], hv = [h(ik)];
    const f = (id) => g[id] + hv[id];
    const heap = new root.MinHeap((a, b) => {
      const fa = f(a), fb = f(b);
      return fa < fb || (fa === fb && (hv[a] < hv[b] || (hv[a] === hv[b] && a < b)));
    });
    const openId = new Map([[ik, 0]]);
    const closed = new Set();
    let peak = 1;
    heap.push(0);
    while (heap.size > 0) {
      const id = heap.pop();
      const k = key[id];
      if (closed.has(k) || openId.get(k) !== id) continue; // stale entry
      openId.delete(k);
      if (k === gk) { res.found = true; res.moves = depth[id]; res.pathCost = g[id]; break; }
      closed.add(k);
      res.expanded++;
      const succ = P.expand(k, o.costModel);
      for (let i = 0; i < succ.length; i++) {
        const s = succ[i];
        res.generated++;
        if (closed.has(s.key)) continue;
        const g2 = g[id] + s.cost;
        const oid = openId.get(s.key);
        if (oid !== undefined && g2 >= g[oid]) continue;
        const cid = key.length;
        key.push(s.key); g.push(g2); depth.push(depth[id] + 1); hv.push(h(s.key));
        if (depth[cid] > res.maxDepth) res.maxDepth = depth[cid];
        openId.set(s.key, cid);
        heap.push(cid);
      }
      const live = openId.size + closed.size;
      if (live > peak) peak = live;
    }
    if (!res.found) res.note = 'Frontier exhausted';
    return finish(res, t0, peak);
  }

  const FUNCS = { bfs: bfs, dfs: dfs, dls: dls, iddls: iddls, gbfs: gbfs, astar: astar };

  /**
   * @param {'bfs'|'dfs'|'dls'|'iddls'|'gbfs'|'astar'} id
   * @param {{costModel?:string, heuristic?:string, dlsLimit?:number, budget?:number, maxIdLimit?:number}} options
   */
  function run(id, init, goal, options) {
    const o = Object.assign(
      { costModel: 'unit', heuristic: 'manhattan', dlsLimit: 10, budget: 800000, maxIdLimit: 40 },
      options || {}
    );
    return FUNCS[id](init, goal, o);
  }

  root.Ref = { run: run, IDS: ['bfs', 'dfs', 'dls', 'iddls', 'gbfs', 'astar'] };
})(typeof window !== 'undefined' ? window : globalThis);
