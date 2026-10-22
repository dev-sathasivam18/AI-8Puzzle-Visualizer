/**
 * ucs.js - Uniform Cost Search for the 8-Puzzle (implemented from scratch).
 *
 * UCS always expands the frontier node with the LOWEST path cost g(n).
 *   - Frontier (open list) : binary min-heap ordered by (g, creation order)
 *   - Explored (closed)    : set of expanded states
 *   - Goal test            : done when a node is POPPED (not when generated) -
 *                            this is what makes UCS optimal for non-uniform costs.
 *   - Cheaper path to a state already in the frontier: a new node replaces the old one
 *     (the old heap entry is left behind and skipped when popped = "lazy deletion").
 *
 * The search runs to completion first and (optionally) records a compact TRACE of
 * every expansion. The visualiser then replays that trace forward and backward, so the
 * animation always shows exactly what the real algorithm did.
 *
 * Counting conventions (shown in the UI):
 *   nodes generated = root + every successor produced while expanding (duplicates included)
 *   nodes expanded  = nodes popped from the frontier and expanded (the goal node is tested, not expanded)
 *   max depth       = deepest node actually created
 */
(function (root) {
  'use strict';

  const P = root.Puzzle;

  // Status of a generated successor (stored in the trace)
  const STATUS = {
    NEW: 0, // added to the frontier
    IMPROVED: 1, // state was already in the frontier but this path is cheaper -> replaced
    DUP_EXPLORED: 2, // state already expanded -> discarded
    DUP_FRONTIER: 3 // state already in the frontier with an equal/lower cost -> discarded
  };

  /**
   * @param {number[]} initialArr
   * @param {number[]} goalArr
   * @param {{costModel?: 'unit'|'tile', record?: boolean, maxExpansions?: number}} options
   */
  function run(initialArr, goalArr, options) {
    const opts = Object.assign({ costModel: 'unit', record: true, maxExpansions: 1000000 }, options || {});
    const rec = opts.record;
    const t0 = P.now();

    const result = {
      algorithm: 'UCS',
      costModel: opts.costModel,
      initial: initialArr.slice(),
      goal: goalArr.slice(),
      found: false,
      reason: '', // 'solved' | 'unsolvable' | 'invalid' | 'exhausted' | 'limit'
      message: '',
      nodes: null,
      trace: null,
      cumGenerated: null,
      cumMaxDepth: null,
      path: [],
      stats: { generated: 0, expanded: 0, maxDepth: 0, moves: 0, pathCost: 0, timeMs: 0, peakNodes: 0, memoryBytes: 0 }
    };

    const err = P.validate(initialArr) || P.validate(goalArr);
    if (err) {
      result.reason = 'invalid';
      result.message = err;
      return result;
    }
    if (!P.isSolvable(initialArr, goalArr)) {
      result.reason = 'unsolvable';
      result.message =
        'The initial and goal states have different inversion parity, so the goal can never be reached by legal moves.';
      return result;
    }

    const initKey = P.keyOf(initialArr);
    const goalKey = P.keyOf(goalArr);

    // ---- node store (struct-of-arrays) ----
    const nKey = [];
    const nParent = [];
    const nG = [];
    const nDepth = [];
    const nDir = [];
    const nArrow = [];
    const nTile = [];
    function newNode(key, parent, g, depth, dir, arrow, tile) {
      nKey.push(key);
      nParent.push(parent);
      nG.push(g);
      nDepth.push(depth);
      nDir.push(dir);
      nArrow.push(arrow);
      nTile.push(tile);
      return nKey.length - 1;
    }

    // ---- frontier & explored ----
    const heap = new root.MinHeap(function (a, b) {
      return nG[a] < nG[b] || (nG[a] === nG[b] && a < b); // lowest g first, FIFO among ties
    });
    const openId = new Map(); // state key -> id of the live frontier node for that state
    const closed = new Set(); // explored states

    // ---- trace (only when recording) ----
    let T = null;
    let cumGen = null;
    let cumMax = null;
    if (rec) {
      T = {
        stepNode: [], // node popped at each step
        stepSuccStart: [0], // successor range of step i = [start[i], start[i+1])
        sKey: [], sG: [], sStatus: [], sId: [], sRep: [], sDir: [], sArrow: [], sTile: [],
        goalStep: -1
      };
      cumGen = [1];
      cumMax = [0];
    }

    const rootId = newNode(initKey, -1, 0, 0, null, '', 0);
    heap.push(rootId);
    openId.set(initKey, rootId);

    let generated = 1;
    let expanded = 0;
    let maxDepth = 0;
    let peak = 1;
    let goalId = -1;

    while (heap.size > 0) {
      const id = heap.pop();
      const key = nKey[id];

      // stale heap entry (state already expanded, or replaced by a cheaper node)?
      if (closed.has(key) || openId.get(key) !== id) continue;
      if (expanded >= opts.maxExpansions) {
        result.reason = 'limit';
        break;
      }
      openId.delete(key);

      if (rec) T.stepNode.push(id);

      // goal test happens at expansion time
      if (key === goalKey) {
        goalId = id;
        if (rec) {
          T.goalStep = T.stepNode.length - 1;
          T.stepSuccStart.push(T.sKey.length);
          cumGen.push(generated);
          cumMax.push(maxDepth);
        }
        break;
      }

      closed.add(key);
      expanded++;

      const succ = P.expand(key, opts.costModel);
      for (let i = 0; i < succ.length; i++) {
        const s = succ[i];
        generated++;
        const g2 = nG[id] + s.cost;
        const d2 = nDepth[id] + 1;
        let status;
        let cid = -1;
        let rep = -1;

        if (closed.has(s.key)) {
          status = STATUS.DUP_EXPLORED;
        } else {
          const oid = openId.get(s.key);
          if (oid === undefined) {
            cid = newNode(s.key, id, g2, d2, s.dir, s.arrow, s.tile);
            openId.set(s.key, cid);
            heap.push(cid);
            status = STATUS.NEW;
          } else if (g2 < nG[oid]) {
            cid = newNode(s.key, id, g2, d2, s.dir, s.arrow, s.tile);
            openId.set(s.key, cid);
            heap.push(cid);
            rep = oid;
            status = STATUS.IMPROVED;
          } else {
            cid = oid;
            status = STATUS.DUP_FRONTIER;
          }
        }
        if (status <= STATUS.IMPROVED && d2 > maxDepth) maxDepth = d2;

        if (rec) {
          T.sKey.push(s.key);
          T.sG.push(g2);
          T.sStatus.push(status);
          T.sId.push(cid);
          T.sRep.push(rep);
          T.sDir.push(s.dir);
          T.sArrow.push(s.arrow);
          T.sTile.push(s.tile);
        }
      }
      if (rec) {
        T.stepSuccStart.push(T.sKey.length);
        cumGen.push(generated);
        cumMax.push(maxDepth);
      }
      const live = openId.size + closed.size;
      if (live > peak) peak = live;
    }

    // ---- wrap up ----
    const timeMs = P.now() - t0;
    result.stats.generated = generated;
    result.stats.expanded = expanded;
    result.stats.maxDepth = maxDepth;
    result.stats.timeMs = timeMs;
    result.stats.peakNodes = peak;
    result.stats.memoryBytes = peak * P.BYTES_PER_NODE;
    result.nodes = { key: nKey, parent: nParent, g: nG, depth: nDepth, dir: nDir, arrow: nArrow, tile: nTile };
    result.trace = T;
    result.cumGenerated = cumGen;
    result.cumMaxDepth = cumMax;

    if (goalId >= 0) {
      result.found = true;
      result.reason = 'solved';
      result.goalId = goalId;
      // rebuild the solution path root -> goal
      const chain = [];
      for (let n = goalId; n !== -1; n = nParent[n]) chain.push(n);
      chain.reverse();
      result.path = chain.map(function (n, idx) {
        return {
          id: n,
          key: nKey[n],
          dir: nDir[n],
          arrow: nArrow[n],
          tile: nTile[n],
          cost: idx === 0 ? 0 : nG[n] - nG[nParent[n]],
          g: nG[n]
        };
      });
      result.stats.moves = result.path.length - 1;
      result.stats.pathCost = nG[goalId];
      result.message = 'Goal reached with the cheapest possible path.';
    } else if (!result.reason) {
      result.reason = 'exhausted';
      result.message = 'The frontier became empty without reaching the goal.';
    } else if (result.reason === 'limit') {
      result.message = 'Stopped: expansion limit reached.';
    }
    return result;
  }

  root.UCS = { run: run, STATUS: STATUS };
})(typeof window !== 'undefined' ? window : globalThis);
