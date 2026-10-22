/**
 * Quick self-checks for the UCS engine.  Run with:   node tests/test-ucs.js
 */
const path = require('path');
const assert = require('assert');
['heap.js', 'puzzle.js', 'ucs.js'].forEach((f) => require(path.join('..', 'js', f)));
const P = globalThis.Puzzle;
const UCS = globalThis.UCS;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

// replays a solution path and returns the cost, asserting every move is legal
function verifyPath(res, costModel) {
  let cost = 0;
  for (let i = 1; i < res.path.length; i++) {
    const succ = P.expand(res.path[i - 1].key, costModel);
    const match = succ.find((s) => s.key === res.path[i].key);
    assert.ok(match, 'illegal move at step ' + i);
    cost += match.cost;
  }
  assert.strictEqual(res.path[0].key, P.keyOf(res.initial));
  assert.strictEqual(res.path[res.path.length - 1].key, P.keyOf(res.goal));
  return cost;
}

test('assignment example is solved in 5 moves (unit cost)', () => {
  const r = UCS.run(P.EXAMPLE_INITIAL, P.EXAMPLE_GOAL);
  assert.ok(r.found);
  assert.strictEqual(r.stats.moves, 5);
  assert.strictEqual(r.stats.pathCost, 5);
  assert.strictEqual(verifyPath(r, 'unit'), 5);
});

test('initial == goal needs 0 moves', () => {
  const r = UCS.run(P.EXAMPLE_GOAL, P.EXAMPLE_GOAL);
  assert.ok(r.found);
  assert.strictEqual(r.stats.moves, 0);
  assert.strictEqual(r.stats.expanded, 0);
});

test('unsolvable puzzle is reported as Not Found', () => {
  const r = UCS.run([1, 2, 3, 4, 5, 6, 8, 7, 0], [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  assert.strictEqual(r.found, false);
  assert.strictEqual(r.reason, 'unsolvable');
});

test('invalid board is rejected', () => {
  const r = UCS.run([1, 1, 3, 4, 5, 6, 7, 8, 0], [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  assert.strictEqual(r.reason, 'invalid');
});

test('hardest 8-puzzle (31 moves) is solved optimally', () => {
  const r = UCS.run([8, 6, 7, 2, 5, 4, 3, 0, 1], [1, 2, 3, 4, 5, 6, 7, 8, 0], { record: false });
  assert.ok(r.found);
  assert.strictEqual(r.stats.moves, 31);
  assert.ok(r.stats.expanded <= 181440);
});

test('tile-weighted costs: path is legal and cost matches g(goal)', () => {
  const init = [8, 6, 7, 2, 5, 4, 3, 0, 1];
  const goal = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const r = UCS.run(init, goal, { costModel: 'tile' });
  assert.ok(r.found);
  assert.strictEqual(verifyPath(r, 'tile'), r.stats.pathCost);
});

test('weighted UCS cost never exceeds the cost of the BFS-style unit-cost path', () => {
  const init = [2, 8, 3, 1, 6, 4, 7, 0, 5];
  const unit = UCS.run(init, P.EXAMPLE_GOAL, { costModel: 'unit' });
  const weighted = UCS.run(init, P.EXAMPLE_GOAL, { costModel: 'tile' });
  let unitPathWeightedCost = 0;
  for (let i = 1; i < unit.path.length; i++) unitPathWeightedCost += unit.path[i].tile;
  assert.ok(weighted.stats.pathCost <= unitPathWeightedCost);
});

test('random puzzles are always solvable and never equal the goal', () => {
  ['easy', 'medium', 'hard'].forEach((d) => {
    for (let i = 0; i < 50; i++) {
      const s = P.randomPuzzle(P.EXAMPLE_GOAL, d);
      assert.strictEqual(P.validate(s), null);
      assert.ok(P.isSolvable(s, P.EXAMPLE_GOAL));
      assert.notStrictEqual(P.keyOf(s), P.keyOf(P.EXAMPLE_GOAL));
    }
  });
});

test('trace replays consistently (frontier / explored bookkeeping)', () => {
  const r = UCS.run([8, 6, 7, 2, 5, 4, 3, 0, 1], [1, 2, 3, 4, 5, 6, 7, 8, 0], { costModel: 'tile' });
  const T = r.trace;
  const frontier = new Set([0]);
  const closed = [];
  const N = T.stepNode.length;
  // forward
  for (let i = 0; i < N; i++) {
    const id = T.stepNode[i];
    assert.ok(frontier.has(id), 'popped node must be in the frontier (step ' + i + ')');
    frontier.delete(id);
    if (i !== T.goalStep) {
      closed.push(id);
      for (let j = T.stepSuccStart[i]; j < T.stepSuccStart[i + 1]; j++) {
        if (T.sStatus[j] === 0) frontier.add(T.sId[j]);
        else if (T.sStatus[j] === 1) {
          assert.ok(frontier.delete(T.sRep[j]));
          frontier.add(T.sId[j]);
        }
      }
    }
  }
  assert.strictEqual(closed.length, r.stats.expanded);
  assert.strictEqual(r.cumGenerated[N], r.stats.generated);
  // backward: undo every step and land on the initial frontier {root}
  for (let i = N - 1; i >= 0; i--) {
    const id = T.stepNode[i];
    if (i !== T.goalStep) {
      for (let j = T.stepSuccStart[i + 1] - 1; j >= T.stepSuccStart[i]; j--) {
        if (T.sStatus[j] === 0) frontier.delete(T.sId[j]);
        else if (T.sStatus[j] === 1) {
          frontier.delete(T.sId[j]);
          frontier.add(T.sRep[j]);
        }
      }
      closed.pop();
    }
    frontier.add(id);
  }
  assert.deepStrictEqual([...frontier], [0]);
  assert.strictEqual(closed.length, 0);
});

console.log('\n' + passed + ' tests passed');
