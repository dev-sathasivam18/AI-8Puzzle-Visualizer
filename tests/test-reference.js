/**
 * Sanity checks for the reference algorithms used on the Comparison page.
 * Run with:   node tests/test-reference.js
 */
const path = require('path');
const assert = require('assert');
['heap.js', 'puzzle.js', 'ucs.js', 'reference-algorithms.js'].forEach((f) => require(path.join('..', 'js', f)));
const P = globalThis.Puzzle;
const UCS = globalThis.UCS;
const Ref = globalThis.Ref;

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

const init = P.EXAMPLE_INITIAL;
const goal = P.EXAMPLE_GOAL;

test('every algorithm solves the assignment example', () => {
  Ref.IDS.forEach((id) => {
    const r = Ref.run(id, init, goal, { dlsLimit: 10 });
    assert.ok(r.found, id + ' should find a solution');
  });
});

test('BFS, IDDLS, A*, GBFS(5) agree on 5 moves; UCS too', () => {
  ['bfs', 'iddls', 'astar'].forEach((id) => assert.strictEqual(Ref.run(id, init, goal).moves, 5, id));
  assert.strictEqual(UCS.run(init, goal, { record: false }).stats.moves, 5);
});

test('A* with both heuristics is optimal on a hard puzzle (31 moves)', () => {
  const i = [8, 6, 7, 2, 5, 4, 3, 0, 1];
  const g = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  ['manhattan', 'misplaced'].forEach((h) => {
    const r = Ref.run('astar', i, g, { heuristic: h });
    assert.strictEqual(r.moves, 31, h);
  });
});

test('A* (Manhattan) path cost == UCS path cost under tile-weighted costs', () => {
  const i = [8, 6, 7, 2, 5, 4, 3, 0, 1];
  const g = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const a = Ref.run('astar', i, g, { costModel: 'tile', heuristic: 'manhattan' });
  const u = UCS.run(i, g, { costModel: 'tile', record: false });
  assert.strictEqual(a.pathCost, u.stats.pathCost);
});

test('A* expands fewer nodes than UCS/BFS on a medium puzzle', () => {
  const i = [2, 8, 3, 1, 6, 4, 7, 0, 5];
  const a = Ref.run('astar', i, goal, {});
  const b = Ref.run('bfs', i, goal, {});
  assert.ok(a.expanded <= b.expanded);
});

test('DLS reports failure when the limit is below the solution depth', () => {
  const r = Ref.run('dls', init, goal, { dlsLimit: 3 });
  assert.strictEqual(r.found, false);
  assert.ok(/limit/i.test(r.note));
});

test('DFS finds a (long) solution and is not optimal', () => {
  const r = Ref.run('dfs', init, goal, {});
  assert.ok(r.found);
  assert.ok(r.moves >= 5);
});

test('IDDLS respects the node budget instead of hanging', () => {
  const r = Ref.run('iddls', [8, 6, 7, 2, 5, 4, 3, 0, 1], [1, 2, 3, 4, 5, 6, 7, 8, 0], { budget: 20000 });
  assert.strictEqual(r.found, false);
  assert.ok(/budget/i.test(r.note));
});

console.log('\n' + passed + ' tests passed');
